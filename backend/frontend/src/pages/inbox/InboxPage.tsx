import { customConfirm } from "../../components/ui/Prompt";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  InboxIcon,
  X,
  Smile,
  Paperclip,
  Trash2,
  Ban,
  MoreVertical,
  FileIcon,
  Info,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "../../components/user/UserAvatar";
import UserProfileOverlay from "../../components/user/UserProfileOverlay";
import PersonPicker from "../../components/ui/PersonPicker";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import {
  inboxConversationsAtom,
  inboxMessagesAtom,
  activeConversationIdAtom,
  inboxUnreadCountAtom,
  type InboxConversation,
  type InboxMessage,
} from "../../atoms/inbox";
import { currentUserAtom } from "../../atoms/auth";
import { uploader, showUploadManagerAtom } from "../../atoms/uploadAtom";
import type { User } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import {
  relativeTime,
  formatLocalTime,
  formatFullDateTime,
} from "../../utils/serverTime";
import Input from "../../components/input/Input";
import "./InboxPage.css";
import { parseInt } from "lodash";

const InboxPage = () => {
  const currentUser = useAtomValue(currentUserAtom);
  const [conversations, setConversations] = useAtom(inboxConversationsAtom);
  const [messages, setMessages] = useAtom(inboxMessagesAtom);
  const [activeId, setActiveId] = useAtom(activeConversationIdAtom);
  const setUnreadCount = useSetAtom(inboxUnreadCountAtom);
  const setShowManager = useSetAtom(showUploadManagerAtom);
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 640);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const subscribedConvsRef = useRef<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

  // Keep the inbox flush with the remaining viewport height
  useEffect(() => {
    const recalcHeight = () => {
      if (wrapperRef.current) {
        const top = wrapperRef.current.getBoundingClientRect().top;
        wrapperRef.current.style.height = `${window.innerHeight - top}px`;
      }
    };
    recalcHeight();
    window.addEventListener("resize", recalcHeight);
    return () => window.removeEventListener("resize", recalcHeight);
  }, []);

  // Mobile detection and panel switch state
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileView("chat");
      } else if (!activeId) {
        setMobileView("list");
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeId]);

  useEffect(() => {
    if (!isMobile) return;
    if (activeId) {
      setMobileView("chat");
    } else {
      setMobileView("list");
    }
  }, [activeId, isMobile]);

  // Load conversations on mount
  useEffect(() => {
    const withUserId = searchParams.get("with");
    apiRequest<InboxConversation[]>("/inbox/conversations")
      .then(async (data) => {
        const convs = data ?? [];
        setConversations(convs);
        // Compute total unread
        const total = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setUnreadCount(total);

        // Auto-open conversation if ?with=userId was passed (e.g. from PresencePanel DM btn)
        if (withUserId) {
          setSearchParams({}, { replace: true }); // clear param from URL
          const existing = convs.find(
            (c) => String(c.other_user?.id) === String(withUserId),
          );
          if (existing) {
            setActiveId(existing.id);
          } else {
            // Create or retrieve the conversation by user ID
            try {
              const conv = await apiRequest<InboxConversation>(
                "/inbox/conversations",
                {
                  method: "POST",
                  body: JSON.stringify({ target_user_id: Number(withUserId) }),
                },
              );
              if (conv) {
                setConversations((prev) => {
                  if (prev.some((c) => c.id === conv.id)) return prev;
                  return [conv, ...prev];
                });
                setActiveId(conv.id);
              }
            } catch {
              // ignore - user may not exist
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));

    return () => {
      // Clear active when leaving the page
      setActiveId(null);
      // Unsubscribe from all conversations subscribed while on this page
      subscribedConvsRef.current.forEach((id) =>
        unsubscribe("inbox_conversation", id),
      );
      subscribedConvsRef.current.clear();
    };
  }, []);

  // Subscribe to every conversation so inbox:update events propagate to the
  // sidebar even when no specific chat is open.
  useEffect(() => {
    conversations.forEach((c) => {
      if (!subscribedConvsRef.current.has(parseInt(String(c.id)))) {
        subscribe("inbox_conversation", c.id);
        subscribedConvsRef.current.add(parseInt(String(c.id)));
      }
    });
  }, [conversations]);

  // When active conversation changes: load messages and subscribe
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      prevCountRef.current = 0;
      return;
    }
    let cancelled = false;
    setLoadingMsgs(true);
    setMessages([]);
    prevCountRef.current = 0;
    isAtBottomRef.current = true;

    apiRequest<InboxMessage[]>(`/inbox/conversations/${activeId}/messages`)
      .then((data) => {
        if (!cancelled) {
          const sorted = (data ?? []).sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
          setMessages(sorted);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingMsgs(false);
      });

    subscribe("inbox_conversation", activeId);

    // Mark conversation as read - subtract the actual per-conversation
    // unread count so the global badge stays accurate.
    const convToMark = conversations.find((c) => c.id === activeId);
    const prevUnread = convToMark?.unread_count ?? 0;
    apiRequest(`/inbox/conversations/${activeId}/read`, { method: "PUT" })
      .then(() => {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)),
        );
        setUnreadCount((prev) => Math.max(0, prev - prevUnread));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe("inbox_conversation", activeId);
    };
  }, [activeId]);

  // Scroll to bottom on load
  useEffect(() => {
    if (!loadingMsgs && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [loadingMsgs]);

  // Auto-scroll to bottom when new messages arrive, but only if the user is
  // already near the bottom - preserve scroll position when reading history.
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = messages.length;
    if (messages.length > prev && feedRef.current && isAtBottomRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  }, []);

  const startConversation = async () => {
    try {
      if (selectedUsers.length === 0) return;
      
      let body: any = {};
      if (selectedUsers.length === 1 && !groupTitle.trim()) {
        body = { target_user_id: Number(selectedUsers[0].id) };
      } else {
        body = {
          participant_ids: selectedUsers.map((u) => Number(u.id)),
          title: groupTitle.trim(),
        };
      }

      const conv = await apiRequest<InboxConversation>("/inbox/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (conv) {
        // Ensure other_user is populated if it's 1-on-1 and backend didn't return it
        if (!conv.is_group && !conv.other_user && selectedUsers.length === 1) {
          const user = selectedUsers[0];
          conv.other_user = {
            id: String(user.id),
            username: user.username,
            display_name: user.display_name || user.username,
            avatar_url: user.avatar_url,
          };
        }
        setConversations((prev) => {
          const existing = prev.find((c) => c.id === conv.id);
          if (existing) {
            return prev.map((c) =>
              c.id === conv.id ? { ...c, other_user: conv.other_user } : c,
            );
          }
          return [conv, ...prev];
        });
        setActiveId(conv.id);
      }
    } catch {
      toast.error("Cannot start conversation.");
    } finally {
      setShowNewDm(false);
      setSelectedUsers([]);
      setGroupTitle("");
    }
  };
  // Infinite scroll handler for search results

  const activeConv = conversations.find((c) => c.id === activeId);
  const blockedByCurrentUser = activeConv?.blocked_by_current_user ?? false;
  const blockedByOtherUser = activeConv?.blocked_by_other_user ?? false;
  const isBlocked = blockedByCurrentUser || blockedByOtherUser;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      setShowManager(true);
      
      // Determine message type from mime
      let messageType = "file";
      if (file.type.startsWith("image/")) messageType = "image";
      else if (file.type.startsWith("video/")) messageType = "video";
      else if (file.type.startsWith("audio/")) messageType = "audio";

      await uploader.upload(file, { 
        uploadType: messageType,
        inboxConversationId: activeId
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeId) return;
    if (!await customConfirm("Delete this conversation and all messages?")) return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== activeId));
      setActiveId(null);
      setMessages([]);
      toast.success("Conversation deleted");
    } catch {
      toast.error("Failed to delete conversation");
    }
    setShowChatMenu(false);
  };

  const handleBlockUser = async () => {
    const otherUserId = activeConv?.other_user?.id;
    if (!otherUserId) return;
    if (
      !await customConfirm(
        `Block ${activeConv?.other_user?.display_name || activeConv?.other_user?.username}?`,
      )
    )
      return;
    try {
      await apiRequest(`/inbox/block/${otherUserId}`, { method: "POST" });
      toast.success("User blocked");
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                blocked_by_current_user: true,
                blocked_by_other_user: false,
              }
            : c,
        ),
      );
    } catch {
      toast.error("Failed to block user");
    }
    setShowChatMenu(false);
  };

  const handleUnblockUser = async () => {
    const otherUserId = activeConv?.other_user?.id;
    if (!otherUserId) return;
    if (
      !await customConfirm(
        `Unblock ${activeConv?.other_user?.display_name || activeConv?.other_user?.username}?`,
      )
    )
      return;
    try {
      await apiRequest(`/inbox/block/${otherUserId}`, { method: "DELETE" });
      toast.success("User unblocked");
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, blocked_by_current_user: false } : c,
        ),
      );
    } catch {
      toast.error("Failed to unblock user");
    }
    setShowChatMenu(false);
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    // We need to insert the emoji into the Input component
    // Since Input manages its own state, we'll use the handleSend approach
    // by dispatching a custom event or using a ref. For simplicity, we'll
    // append to a message draft ref.
    setEmojiToInsert(emoji.native);
    setShowEmojiPicker(false);
  };

  const [emojiToInsert, setEmojiToInsert] = useState<string | null>(null);

  const inboxPageClass = isMobile
    ? `inbox-page inbox-page--mobile-${mobileView}`
    : "inbox-page";

  return (
    <div className="inbox-page-wrapper" ref={wrapperRef}>
      <div className={inboxPageClass}>
        {/* Left: Conversation list */}
        <aside className="inbox-sidebar">
          <div className="inbox-sidebar-header">
            <h2 className="inbox-sidebar-title">Messages</h2>
            <button
              className="inbox-new-btn"
              onClick={() => setShowNewDm(true)}
              title="New message"
            >
              <Plus size={16} />
            </button>
          </div>

          {showNewDm && (
            <div className="inbox-new-dm" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedUsers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    >
                      {u.display_name || u.username}
                      <button
                        onClick={() =>
                          setSelectedUsers((prev) =>
                            prev.filter((x) => x.id !== u.id),
                          )
                        }
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'var(--color-text-secondary)' }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {selectedUsers.length > 1 && (
                <input
                  type="text"
                  className="inbox-new-dm-input"
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  placeholder="Group Name (Optional)"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                />
              )}
              <PersonPicker
                onSelect={(user) => {
                  if (!selectedUsers.find((u) => u.id === user.id)) {
                    setSelectedUsers((prev) => [...prev, user]);
                  }
                }}
                excludeIds={selectedUsers.map(u => u.id)}
                placeholder={selectedUsers.length > 0 ? "Add more users…" : "Search users…"}
                onClose={() => {
                  setShowNewDm(false);
                  setSelectedUsers([]);
                  setGroupTitle("");
                }}
              />
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '8px', borderRadius: '8px', fontWeight: 500 }}
                onClick={startConversation}
                disabled={selectedUsers.length === 0}
              >
                {selectedUsers.length > 1 ? "Create Group" : "Start Chat"}
              </button>
            </div>
          )}

          <div className="inbox-conv-list">
            {loadingConvs && <p className="inbox-loading">Loading…</p>}
            {!loadingConvs && conversations.length === 0 && !showNewDm && (
              <p className="inbox-empty">No conversations yet.</p>
            )}

            {/* Existing conversations (dimmed when search is active) */}
            <div className={showNewDm ? "inbox-convs-dimmed" : ""}>
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  c={c}
                  activeId={activeId}
                  isMobile={isMobile}
                  onSelect={() => {
                    setActiveId(c.id);
                    if (isMobile) setMobileView("chat");
                  }}
                />
              ))}
            </div>
          </div>
        </aside>

        {/* Right: Message feed */}
        <section className="inbox-main">
          {!activeId ? (
            <div className="inbox-placeholder">
              <InboxIcon size={40} />
              <p>Select a conversation or start a new one</p>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <InboxChatHeader
                isMobile={isMobile}
                onMobileBack={() => setMobileView("list")}
                activeConv={activeConv}
                isBlocked={isBlocked}
                blockedByCurrentUser={blockedByCurrentUser}
                blockedByOtherUser={blockedByOtherUser}
                showChatMenu={showChatMenu}
                onToggleChatMenu={() => setShowChatMenu((v) => !v)}
                onDelete={handleDeleteConversation}
                onBlock={handleBlockUser}
                onUnblock={handleUnblockUser}
              />
              {/* Messages */}
              <div className="inbox-feed" ref={feedRef} onScroll={handleScroll}>
                {loadingMsgs && (
                  <p className="inbox-loading">Loading messages…</p>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <p className="inbox-empty">No messages yet. Say hello!</p>
                )}
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    m={m}
                    currentUserId={currentUser?.id}
                  />
                ))}
              </div>

              {/* Input */}
              <div className="inbox-input-row">
                <div className="inbox-input-toolbar">
                  <button
                    className="inbox-toolbar-btn"
                    onClick={() => setShowEmojiPicker((v) => !v)}
                    title="Emoji"
                    type="button"
                    disabled={isBlocked}
                  >
                    <Smile size={18} />
                  </button>
                  <button
                    className="inbox-toolbar-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    type="button"
                    disabled={isBlocked}
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="inbox-file-input"
                    onChange={handleFileUpload}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.gif"
                  />
                </div>
                <div className="inbox-input-field">
                  {showEmojiPicker && (
                    <div className="inbox-emoji-picker">
                      <Picker
                        data={data}
                        onEmojiSelect={handleEmojiSelect}
                        theme="dark"
                        previewPosition="none"
                        skinTonePosition="none"
                      />
                    </div>
                  )}
                  <Input
                    className="inbox-chat-input"
                    handleSend={async (msg) => {
                      if (!msg.trim() || !activeId || sending) return;
                      setSending(true);
                      try {
                        await apiRequest<InboxMessage>(
                          `/inbox/conversations/${activeId}/messages`,
                          {
                            method: "POST",
                            body: JSON.stringify({ content: msg }),
                          },
                        );
                      } catch (err) {
                        console.error("Failed to send message:", err);
                      } finally {
                        setSending(false);
                      }
                    }}
                    disabled={sending}
                    placeholder="Write a message…"
                    maxRows={4}
                    maxLength={2000}
                    compact
                    insertText={emojiToInsert}
                    onInsertTextConsumed={() => setEmojiToInsert(null)}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default InboxPage;

// Sub-components

function ConversationRow({
  c,
  activeId,
  isMobile: _isMobile,
  onSelect,
}: {
  c: InboxConversation;
  activeId: string | null;
  isMobile: boolean;
  onSelect: () => void;
}) {
  const other = c.other_user;
  const isGroup = c.is_group;
  const isActive = c.id === activeId;
  const displayName = isGroup ? (c.title || `Group Chat (${c.participants?.length || 0})`) : (other?.display_name || other?.username || "Unknown");

  return (
    <button
      className={`inbox-conv-row${
        isActive ? " inbox-conv-row--active" : ""
      }${c.unread_count > 0 ? " inbox-conv-row--unread" : ""}`}
      onClick={onSelect}
    >
      <span className="inbox-conv-avatar">
        {isGroup ? (
          <div className="inbox-group-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', backgroundColor: '#333' }}>
            <UserAvatar src={undefined} alt="Group" size={36} initials="G" />
          </div>
        ) : other ? (
          <UserProfileOverlay userId={other.id} fallbackName={other.display_name || other.username} fallbackAvatar={other.avatar_url || undefined} disableClick={true}>
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <UserAvatar
                src={other.avatar_url || undefined}
                alt={other.display_name || other.username}
                size={36}
                initials={(other.display_name ||
                  other.username)?.[0]?.toUpperCase()}
              />
            </div>
          </UserProfileOverlay>
        ) : (
          <UserAvatar
            src={undefined}
            alt="Unknown"
            size={36}
            initials="?"
          />
        )}
      </span>
      <span className="inbox-conv-info">
        <span className="inbox-conv-name">{displayName}</span>
        {c.last_message && (
          <span className="inbox-conv-preview">
            {c.last_message.content.slice(0, 50)}
          </span>
        )}
      </span>
      <span className="inbox-conv-meta">
        {c.last_message && (
          <span className="inbox-conv-time">
            {relativeTime(c.last_message.created_at)}
          </span>
        )}
        {c.unread_count > 0 && c.id !== activeId && (
          <span className="inbox-unread-badge">{c.unread_count}</span>
        )}
      </span>
    </button>
  );
}

function InboxChatHeader({
  isMobile,
  onMobileBack,
  activeConv,
  isBlocked,
  blockedByCurrentUser,
  blockedByOtherUser,
  showChatMenu,
  onToggleChatMenu,
  onDelete,
  onBlock,
  onUnblock,
}: {
  isMobile: boolean;
  onMobileBack: () => void;
  activeConv: InboxConversation | undefined;
  isBlocked: boolean;
  blockedByCurrentUser: boolean;
  blockedByOtherUser: boolean;
  showChatMenu: boolean;
  onToggleChatMenu: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const isGroup = activeConv?.is_group;
  const other = activeConv?.other_user;
  const displayName = isGroup ? (activeConv.title || `Group Chat (${activeConv.participants?.length || 0})`) : (other?.display_name || other?.username || "Unknown");

  return (
    <div className="inbox-chat-header">
      {isMobile && (
        <button
          className="inbox-back-btn"
          onClick={onMobileBack}
          title="Back to conversations"
        >
          ←
        </button>
      )}
      <div className="inbox-chat-user">
        {isGroup ? (
          <>
            <span className="inbox-chat-avatar" style={{ marginRight: 12 }}>
              <UserAvatar src={undefined} alt="Group" size={32} initials="G" />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="inbox-chat-username">{displayName}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                {activeConv.participants?.map(p => p.display_name || p.username).join(', ')}
              </span>
            </div>
          </>
        ) : other ? (
          <>
            <Link
              to={`/users/${other.id}`}
              className="inbox-chat-user-link"
            >
              <span className="inbox-chat-avatar">
                <UserProfileOverlay userId={other.id} fallbackName={other.display_name || other.username} fallbackAvatar={other.avatar_url || undefined} disableClick={true}>
                  <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                    <UserAvatar
                      src={other.avatar_url || undefined}
                      alt={displayName}
                      size={32}
                    />
                  </div>
                </UserProfileOverlay>
              </span>
              <span className="inbox-chat-username">{displayName}</span>
            </Link>
            {isBlocked && (
              <span className="inbox-block-status">
                <Info size={14} />
                {blockedByCurrentUser
                  ? "You blocked this user"
                  : "Blocked by user"}
              </span>
            )}
          </>
        ) : (
          <span className="inbox-chat-username">Conversation</span>
        )}
      </div>
      <div className="inbox-chat-actions">
        <button
          className="inbox-action-btn"
          onClick={onToggleChatMenu}
          title="More options"
        >
          <MoreVertical size={16} />
        </button>
        {showChatMenu && (
          <div className="inbox-chat-menu">
            <button onClick={onDelete}>
              <Trash2 size={14} /> Delete conversation
            </button>
            {!isGroup && (blockedByCurrentUser ? (
              <button onClick={onUnblock}>
                <Ban size={14} /> Unblock user
              </button>
            ) : blockedByOtherUser ? (
              <button disabled>
                <Ban size={14} /> Blocked by user
              </button>
            ) : (
              <button onClick={onBlock}>
                <Ban size={14} /> Block user
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  currentUserId,
}: {
  m: InboxMessage;
  currentUserId: string | undefined;
}) {
  if (m.message_type === "system_group_created") {
    return (
      <div className="inbox-msg-system" style={{ textAlign: "center", margin: "1rem 0", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
        <span><strong>{m.sender_name}</strong> {m.content} on {formatLocalTime(m.created_at)}</span>
      </div>
    );
  }

  const isMe = String(m.sender_id) === String(currentUserId);
  return (
    <div className={`inbox-msg${isMe ? " inbox-msg--me" : ""}`}>
      {!isMe && (
        <span className="inbox-msg-avatar">
          <UserProfileOverlay userId={m.sender_id} fallbackName={m.sender_name} fallbackAvatar={m.sender_avatar || undefined}>
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <UserAvatar
                src={m.sender_avatar || undefined}
                alt={m.sender_name}
                size={28}
                initials={m.sender_name?.[0]?.toUpperCase()}
              />
            </div>
          </UserProfileOverlay>
        </span>
      )}
      <div className="inbox-msg-body">
        {!isMe && <span className="inbox-msg-author">{m.sender_name}</span>}
        {/* Attachment rendering */}
        {m.attachment_url && m.message_type === "image" && (
          <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
            <img
              src={m.attachment_url}
              alt={m.attachment_name || "image"}
              className="inbox-msg-image"
            />
          </a>
        )}
        {m.attachment_url && m.message_type === "video" && (
          <video src={m.attachment_url} controls className="inbox-msg-video" />
        )}
        {m.attachment_url && m.message_type === "audio" && (
          <audio src={m.attachment_url} controls className="inbox-msg-audio" />
        )}
        {m.attachment_url && m.message_type === "file" && (
          <a
            href={m.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inbox-msg-file"
          >
            <FileIcon size={16} />
            <span>{m.attachment_name || "Download file"}</span>
            {m.attachment_size ? (
              <span className="inbox-msg-file-size">
                {(m.attachment_size / 1024).toFixed(0)} KB
              </span>
            ) : null}
          </a>
        )}
        {m.message_type === "page_card" &&
          (() => {
            try {
              const card = JSON.parse(m.content);
              return (
                <Link
                  to={card.route || `/page/${card.slug}`}
                  className="inbox-page-card"
                >
                  <div className="inbox-page-card__icon">
                    <FileText size={20} />
                  </div>
                  <div className="inbox-page-card__body">
                    <span className="inbox-page-card__label">
                      New page created
                    </span>
                    <span className="inbox-page-card__title">
                      {card.title || card.slug}
                    </span>
                    {card.description && (
                      <span className="inbox-page-card__desc">
                        {card.description}
                      </span>
                    )}
                    <span className="inbox-page-card__link">
                      Open your page
                    </span>
                  </div>
                </Link>
              );
            } catch {
              return <p className="inbox-msg-content">{m.content}</p>;
            }
          })()}
        {m.content && (!m.message_type || m.message_type === "text") && (
          <p className="inbox-msg-content">{m.content}</p>
        )}
        {m.content &&
          m.message_type &&
          m.message_type !== "text" &&
          m.content !== m.attachment_name && (
            <p className="inbox-msg-content inbox-msg-caption">{m.content}</p>
          )}
        <span
          className="inbox-msg-time"
          title={formatFullDateTime(m.created_at)}
        >
          {formatLocalTime(m.created_at)}
        </span>
      </div>
    </div>
  );
}

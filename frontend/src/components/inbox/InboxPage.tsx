import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Check, InboxIcon, Lock, Paperclip, Plus, Smile, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { currentUserAtom } from "../../atoms/auth";
import type { User } from "../../atoms/auth";
import {
  type InboxConversation,
  type InboxMessage,
  activeConversationIdAtom,
  inboxConversationsAtom,
  inboxMessagesAtom,
  inboxUnreadCountAtom,
} from "../../atoms/inbox";
import { showUploadManagerAtom, uploader } from "../../atoms/uploadAtom";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";
import Input from "../ui/ComposerInput";
import PersonPicker from "../ui/PersonPicker";
import { customConfirm } from "../ui/Prompt";
import { SkeletonContent } from "../ui/Skeleton";
import { ConversationRow } from "./ConversationRow";
import { InboxChatHeader } from "./InboxChatHeader";
import { MessageBubble } from "./MessageBubble";
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

  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 640);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const feedRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const subscribedConvsRef = useRef<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

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
      .then(async data => {
        const convs = data ?? [];
        setConversations(convs);
        // Compute total unread
        const total = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setUnreadCount(total);

        // Auto-open conversation if ?with=userId was passed (e.g. from PresencePanel DM btn)
        if (withUserId) {
          setSearchParams({}, { replace: true }); // clear param from URL
          const existing = convs.find(c => String(c.other_user?.id) === String(withUserId));
          if (existing) {
            setActiveId(existing.id);
          } else {
            // Create or retrieve the conversation by user ID
            try {
              const conv = await apiRequest<InboxConversation>("/inbox/conversations", {
                method: "POST",
                body: JSON.stringify({ target_user_id: Number(withUserId) }),
              });
              if (conv) {
                setConversations(prev => {
                  if (prev.some(c => c.id === conv.id)) return prev;
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
      subscribedConvsRef.current.forEach(id => unsubscribe("inbox_conversation", id));
      subscribedConvsRef.current.clear();
    };
  }, []);

  // Subscribe to every conversation so inbox:update events propagate to the
  // sidebar even when no specific chat is open.
  useEffect(() => {
    conversations.forEach(c => {
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
      .then(data => {
        if (!cancelled) {
          const sorted = (data ?? []).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
    const convToMark = conversations.find(c => c.id === activeId);
    const prevUnread = convToMark?.unread_count ?? 0;
    apiRequest(`/inbox/conversations/${activeId}/read`, { method: "PUT" })
      .then(() => {
        setConversations(prev =>
          prev.map(c => (c.id === activeId ? { ...c, unread_count: 0 } : c))
        );
        setUnreadCount(prev => Math.max(0, prev - prevUnread));
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
          participant_ids: selectedUsers.map(u => Number(u.id)),
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
          conv.other_user = user;
        }
        setConversations(prev => {
          const existing = prev.find(c => c.id === conv.id);
          if (existing) {
            return prev.map(c => (c.id === conv.id ? { ...c, other_user: conv.other_user } : c));
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
  const activeConv = conversations.find(c => c.id === activeId);
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
        inboxConversationId: activeId,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeId) return;
    if (
      !(await customConfirm({
        title: "Delete this conversation?",
        body: "The conversation will move to Trash. Its messages remain retained and hidden until restoration.",
        confirmLabel: "Delete conversation",
        destructive: true,
      }))
    )
      return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}`, {
        method: "DELETE",
      });
      setConversations(prev => prev.filter(c => c.id !== activeId));
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
      !(await customConfirm(
        `Block ${activeConv?.other_user?.display_name || activeConv?.other_user?.username}?`
      ))
    )
      return;
    try {
      await apiRequest(`/inbox/block/${otherUserId}`, { method: "POST" });
      toast.success("User blocked");
      setConversations(prev =>
        prev.map(c =>
          c.id === activeId
            ? {
                ...c,
                blocked_by_current_user: true,
                blocked_by_other_user: false,
              }
            : c
        )
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
      !(await customConfirm(
        `Unblock ${activeConv?.other_user?.display_name || activeConv?.other_user?.username}?`
      ))
    )
      return;
    try {
      await apiRequest(`/inbox/block/${otherUserId}`, { method: "DELETE" });
      toast.success("User unblocked");
      setConversations(prev =>
        prev.map(c => (c.id === activeId ? { ...c, blocked_by_current_user: false } : c))
      );
    } catch {
      toast.error("Failed to unblock user");
    }
    setShowChatMenu(false);
  };

  const handleLock = async (locked: boolean) => {
    if (!activeId) return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}/lock`, {
        method: "PUT",
        body: JSON.stringify({ locked }),
      });
      setConversations(prev =>
        prev.map(c => (c.id.toString() === activeId ? { ...c, is_locked: locked } : c))
      );
      toast.success(locked ? "Conversation locked" : "Conversation unlocked");
    } catch (e: any) {
      toast.error(e.message || "Failed to update lock state");
    }
  };

  const handleKick = async (userId: string) => {
    if (!activeId) return;
    const isMe = userId === currentUser?.id?.toString();
    if (
      !(await customConfirm(
        isMe ? "Are you sure you want to leave this group?" : "Remove this participant?"
      ))
    )
      return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}/participants/${isMe ? "me" : userId}`, {
        method: "DELETE",
      });
      if (isMe) {
        setConversations(prev => prev.filter(c => c.id.toString() !== activeId));
        setActiveId(null);
      } else {
        setConversations(prev =>
          prev.map(c =>
            c.id.toString() === activeId
              ? {
                  ...c,
                  participants: c.participants?.filter(p => p.id.toString() !== userId),
                }
              : c
          )
        );
      }
      toast.success(isMe ? "You left the group" : "Participant removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to remove participant");
    }
  };

  const handleMute = async (userId: string, muted: boolean) => {
    if (!activeId) return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}/participants/${userId}/mute`, {
        method: "PUT",
        body: JSON.stringify({ muted }),
      });
      toast.success(muted ? "Participant muted" : "Participant unmuted");
    } catch (e: any) {
      toast.error(e.message || "Failed to mute participant");
    }
  };

  const handleChangeRole = async (userId: string, role: string) => {
    if (!activeId) return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}/participants/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      toast.success("Role updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update role");
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    // We need to insert the emoji into the Input component
    // Since Input manages its own state, we'll use the handleSend approach
    // by dispatching a custom event or using a ref. For simplicity, we'll
    // append to a message draft ref.
    setEmojiToInsert(emoji.native);
    setShowEmojiPicker(false);
  };

  const handleAddUser = async (user: any) => {
    if (!activeId) return;
    try {
      await apiRequest(`/inbox/conversations/${activeId}/participants`, {
        method: "POST",
        body: JSON.stringify({ user_id: user.id }),
      });
      toast.success("User added to group");
    } catch (e: any) {
      toast.error(e.message || "Failed to add user");
      throw e;
    }
  };

  const [emojiToInsert, setEmojiToInsert] = useState<string | null>(null);

  const inboxPageClass = isMobile ? `inbox-page inbox-page--mobile-${mobileView}` : "inbox-page";

  return (
    <div className="inbox-page-wrapper">
      <div className={inboxPageClass}>
        {/* Left: Conversation list */}
        <aside className="inbox-sidebar">
          <div className="inbox-sidebar-header">
            <h2 className="inbox-sidebar-title">Messages</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              {showNewDm && selectedUsers.length > 0 && (
                <button className="inbox-new-btn" onClick={startConversation} title="Create">
                  <Check size={16} />
                </button>
              )}
              <button
                className="inbox-new-btn"
                onClick={() => {
                  if (showNewDm) {
                    setShowNewDm(false);
                    setSelectedUsers([]);
                    setGroupTitle("");
                  } else {
                    setShowNewDm(true);
                  }
                }}
                title={showNewDm ? "Cancel" : "New message"}
              >
                {showNewDm ? <X size={16} /> : <Plus size={16} />}
              </button>
            </div>
          </div>

          {showNewDm && (
            <div
              className="inbox-new-dm"
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {selectedUsers.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {selectedUsers.map(u => (
                    <span
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "var(--color-bg-secondary)",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    >
                      {u.display_name || u.username}
                      <button
                        onClick={() => setSelectedUsers(prev => prev.filter(x => x.id !== u.id))}
                        style={{
                          cursor: "pointer",
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--color-text-secondary)",
                        }}
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
                    width: "100%",
                    padding: "8px",
                    borderRadius: "8px",
                    background: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                  placeholder="Group Name (Optional)"
                  value={groupTitle}
                  onChange={e => setGroupTitle(e.target.value)}
                />
              )}
              <PersonPicker
                onSelect={user => {
                  if (!selectedUsers.find(u => u.id === user.id)) {
                    setSelectedUsers(prev => [...prev, user]);
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
            </div>
          )}

          <div className="inbox-conv-list">
            {loadingConvs && (
              <div className="inbox-loading">
                {Array.from({ length: 4 }, (_, index) => (
                  <SkeletonContent
                    key={`conversation-skeleton-${index}`}
                    variant="card"
                    label={index === 0 ? "Loading conversations" : undefined}
                    announce={index === 0}
                  />
                ))}
              </div>
            )}
            {!loadingConvs && conversations.length === 0 && !showNewDm && (
              <p className="inbox-empty">No conversations yet.</p>
            )}

            {/* Existing conversations (dimmed when search is active) */}
            <div className={showNewDm ? "inbox-convs-dimmed" : ""}>
              {conversations.map(c => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  activeId={activeId}
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
                activeConv={activeConv!}
                isBlocked={isBlocked}
                blockedByCurrentUser={blockedByCurrentUser}
                blockedByOtherUser={blockedByOtherUser}
                showChatMenu={showChatMenu}
                onToggleChatMenu={() => setShowChatMenu(v => !v)}
                onDelete={handleDeleteConversation}
                onBlock={handleBlockUser}
                onUnblock={handleUnblockUser}
                currentUserId={currentUser?.id?.toString()}
                onLock={handleLock}
                onKick={handleKick}
                onMute={handleMute}
                onChangeRole={handleChangeRole}
                onAddUser={handleAddUser}
              />
              {/* Messages */}
              <div className="inbox-feed" ref={feedRef} onScroll={handleScroll}>
                {loadingMsgs && (
                  <div className="inbox-loading">
                    {Array.from({ length: 3 }, (_, index) => (
                      <SkeletonContent
                        key={`message-skeleton-${index}`}
                        variant="card"
                        label={index === 0 ? "Loading messages" : undefined}
                        announce={index === 0}
                      />
                    ))}
                  </div>
                )}
                {activeConv?.is_group && !loadingMsgs && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      margin: "24px 0 16px",
                    }}
                  >
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                        background: "var(--bg-tertiary)",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        maxWidth: "85%",
                      }}
                    >
                      <Lock
                        size={10}
                        style={{
                          display: "inline",
                          verticalAlign: "middle",
                          marginRight: 4,
                          marginBottom: 2,
                        }}
                      />
                      This is the start of the group chat. No one outside of this chat can read or
                      listen to them.
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                        background: "var(--bg-tertiary)",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        maxWidth: "85%",
                      }}
                    >
                      {activeConv?.participants?.find(p => p.role === "owner")?.display_name ||
                        activeConv?.participants?.find(p => p.role === "owner")?.username ||
                        "Someone"}{" "}
                      created this group "{activeConv?.title}". You and{" "}
                      {Math.max(0, (activeConv?.participants?.length || 0) - 2)} others were added.
                    </div>
                  </div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <p className="inbox-empty">No messages yet. Say hello!</p>
                )}
                {messages.map(m => (
                  <MessageBubble key={m.id} message={m} currentUserId={currentUser?.id} />
                ))}
              </div>

              {/* Input */}
              <div className="inbox-input-row">
                <div className="inbox-input-toolbar">
                  <button
                    className="action-btn"
                    onClick={() => setShowEmojiPicker(v => !v)}
                    title="Emoji"
                    type="button"
                    disabled={
                      isBlocked ||
                      activeConv?.is_locked ||
                      (activeConv?.is_group &&
                        !!activeConv.participants?.find(
                          p => p.id.toString() === currentUser?.id?.toString() && p.is_muted
                        ))
                    }
                  >
                    <Smile size={18} />
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    type="button"
                    disabled={
                      isBlocked ||
                      activeConv?.is_locked ||
                      (activeConv?.is_group &&
                        !!activeConv.participants?.find(
                          p => p.id.toString() === currentUser?.id?.toString() && p.is_muted
                        ))
                    }
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
                    handleSend={async msg => {
                      if (!msg.trim() || !activeId) return;
                      try {
                        await apiRequest<InboxMessage>(
                          `/inbox/conversations/${activeId}/messages`,
                          {
                            method: "POST",
                            body: JSON.stringify({ content: msg }),
                          }
                        );
                      } catch (err) {
                        console.error("Failed to send message:", err);
                      }
                    }}
                    disabled={
                      isBlocked ||
                      activeConv?.is_locked ||
                      !!(
                        activeConv?.is_group &&
                        activeConv.participants?.find(
                          p => p.id.toString() === currentUser?.id?.toString() && p.is_muted
                        )
                      )
                    }
                    placeholder={
                      activeConv?.is_locked
                        ? "Conversation is locked"
                        : activeConv?.is_group &&
                            activeConv.participants?.find(
                              p => p.id.toString() === currentUser?.id?.toString() && p.is_muted
                            )
                          ? "You are muted"
                          : "Write a message…"
                    }
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

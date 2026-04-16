import { useEffect, useRef, useState, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  InboxIcon,
  Search,
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
import Picker from "@emoji-mart/react";
import UserAvatar from "../../components/user/UserAvatar";
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
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newDmTarget, setNewDmTarget] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchListRef = useRef<HTMLDivElement>(null);

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
  const [uploadingFile, setUploadingFile] = useState(false);

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
              // ignore — user may not exist
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

    // Mark conversation as read — subtract the actual per-conversation
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
  // already near the bottom — preserve scroll position when reading history.
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

  const startNewDm = async () => {
    if (!newDmTarget.trim()) return;
    try {
      const conv = await apiRequest<InboxConversation>("/inbox/conversations", {
        method: "POST",
        body: JSON.stringify({ target_username: newDmTarget.trim() }),
      });
      if (conv) {
        setConversations((prev) => {
          if (prev.some((c) => c.id === conv.id)) return prev;
          return [conv, ...prev];
        });
        setActiveId(conv.id);
      }
    } catch {
      toast.error("User not found or cannot start conversation.");
    } finally {
      setShowNewDm(false);
      setNewDmTarget("");
      setSearchResults([]);
    }
  };

  const startDmWithUser = async (user: User) => {
    try {
      const conv = await apiRequest<InboxConversation>("/inbox/conversations", {
        method: "POST",
        body: JSON.stringify({ target_user_id: Number(user.id) }),
      });
      if (conv) {
        // Ensure other_user is populated even if backend didn't return it
        if (!conv.other_user) {
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
            // Update existing conversation with enriched other_user
            return prev.map((c) =>
              c.id === conv.id ? { ...c, other_user: conv.other_user } : c,
            );
          }
          return [conv, ...prev];
        });
        setActiveId(conv.id);
      }
    } catch {
      toast.error("Cannot start conversation with this user.");
    } finally {
      setShowNewDm(false);
      setNewDmTarget("");
      setSearchResults([]);
    }
  };

  // Debounced user search (resets on query change)
  const SEARCH_PAGE_SIZE = 50;
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!showNewDm) {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(true);
      return;
    }
    setSearchLoading(true);
    setSearchOffset(0);
    setSearchHasMore(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const q = newDmTarget.trim();
        const url = q
          ? `/users/search?q=${encodeURIComponent(q)}&limit=${SEARCH_PAGE_SIZE}&offset=0`
          : `/users/search?limit=${SEARCH_PAGE_SIZE}&offset=0`;
        const users = await apiRequest<User[]>(url);
        const filtered = (users ?? []).filter(
          (u) => String(u.id) !== String(currentUser?.id),
        );
        setSearchResults(filtered);
        setSearchOffset(SEARCH_PAGE_SIZE);
        setSearchHasMore((users ?? []).length >= SEARCH_PAGE_SIZE);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [newDmTarget, showNewDm, currentUser?.id]);

  // Load more users (infinite scroll)
  const loadMoreUsers = useCallback(async () => {
    if (searchLoadingMore || !searchHasMore) return;
    setSearchLoadingMore(true);
    try {
      const q = newDmTarget.trim();
      const url = q
        ? `/users/search?q=${encodeURIComponent(q)}&limit=${SEARCH_PAGE_SIZE}&offset=${searchOffset}`
        : `/users/search?limit=${SEARCH_PAGE_SIZE}&offset=${searchOffset}`;
      const users = await apiRequest<User[]>(url);
      const filtered = (users ?? []).filter(
        (u) => String(u.id) !== String(currentUser?.id),
      );
      setSearchResults((prev) => {
        const ids = new Set(prev.map((u) => u.id));
        return [...prev, ...filtered.filter((u) => !ids.has(u.id))];
      });
      setSearchOffset((prev) => prev + SEARCH_PAGE_SIZE);
      setSearchHasMore((users ?? []).length >= SEARCH_PAGE_SIZE);
    } catch {
      // ignore
    } finally {
      setSearchLoadingMore(false);
    }
  }, [
    searchOffset,
    searchHasMore,
    searchLoadingMore,
    newDmTarget,
    currentUser?.id,
  ]);

  // Infinite scroll handler for search results
  const handleSearchScroll = useCallback(() => {
    if (!searchListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = searchListRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMoreUsers();
    }
  }, [loadMoreUsers]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const blockedByCurrentUser = activeConv?.blocked_by_current_user ?? false;
  const blockedByOtherUser = activeConv?.blocked_by_other_user ?? false;
  const isBlocked = blockedByCurrentUser || blockedByOtherUser;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      // Determine upload endpoint based on file type
      let endpoint = "/upload/file";
      if (file.type.startsWith("image/")) endpoint = "/upload/image";
      else if (file.type.startsWith("video/")) endpoint = "/upload/video";

      const uploadRes = await apiRequest<{ url: string }>(endpoint, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes?.url) {
        toast.error("Upload failed");
        return;
      }

      // Determine message type from mime
      let messageType = "file";
      if (file.type.startsWith("image/")) messageType = "image";
      else if (file.type.startsWith("video/")) messageType = "video";
      else if (file.type.startsWith("audio/")) messageType = "audio";

      const sentMsg = await apiRequest<InboxMessage>(
        `/inbox/conversations/${activeId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: file.name,
            message_type: messageType,
            attachment_url: uploadRes.url,
            attachment_name: file.name,
            attachment_size: file.size,
            attachment_mime: file.type,
          }),
        },
      );
      if (sentMsg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === sentMsg.id)) return prev;
          return [...prev, sentMsg];
        });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId
              ? { ...c, last_message: sentMsg, updated_at: sentMsg.created_at }
              : c,
          ),
        );
      }
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeId) return;
    if (!confirm("Delete this conversation and all messages?")) return;
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
      !confirm(
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
      !confirm(
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
        {/* ── Left: Conversation list ── */}
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
            <div className="inbox-new-dm">
              <div className="inbox-search-input-wrapper">
                <Search size={14} className="inbox-search-icon" />
                <input
                  className="inbox-new-dm-input"
                  placeholder="Search users…"
                  value={newDmTarget}
                  autoFocus
                  onChange={(e) => setNewDmTarget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") startNewDm();
                    if (e.key === "Escape") {
                      setShowNewDm(false);
                      setNewDmTarget("");
                      setSearchResults([]);
                    }
                  }}
                />
                <button
                  className="inbox-search-clear"
                  onClick={() => {
                    setShowNewDm(false);
                    setNewDmTarget("");
                    setSearchResults([]);
                  }}
                  title="Close search"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="inbox-conv-list">
            {loadingConvs && <p className="inbox-loading">Loading…</p>}
            {!loadingConvs && conversations.length === 0 && !showNewDm && (
              <p className="inbox-empty">No conversations yet.</p>
            )}

            {/* Search results (shown when search panel is open) */}
            {showNewDm && (
              <div
                className="inbox-search-results"
                ref={searchListRef}
                onScroll={handleSearchScroll}
              >
                {searchLoading && <p className="inbox-loading">Searching…</p>}
                {!searchLoading && searchResults.length === 0 && (
                  <p className="inbox-empty">No users found.</p>
                )}
                {searchResults.map((user) => (
                  <UserSearchResult
                    key={user.id}
                    user={user}
                    onSelect={() => startDmWithUser(user)}
                  />
                ))}
                {searchLoadingMore && (
                  <p className="inbox-loading">Loading more…</p>
                )}
              </div>
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

        {/* ── Right: Message feed ── */}
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
                    disabled={uploadingFile || isBlocked}
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
                        const sentMsg = await apiRequest<InboxMessage>(
                          `/inbox/conversations/${activeId}/messages`,
                          {
                            method: "POST",
                            body: JSON.stringify({ content: msg }),
                          },
                        );
                        if (sentMsg) {
                          setMessages((prev) => {
                            if (prev.some((m) => m.id === sentMsg.id))
                              return prev;
                            return [...prev, sentMsg];
                          });
                          setConversations((prev) =>
                            prev.map((c) =>
                              c.id === activeId
                                ? {
                                    ...c,
                                    last_message: sentMsg,
                                    updated_at: sentMsg.created_at,
                                  }
                                : c,
                            ),
                          );
                        }
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

// ── Sub-components ────────────────────────────────────────────────────────────

function UserSearchResult({
  user,
  onSelect,
}: {
  user: User;
  onSelect: () => void;
}) {
  return (
    <button
      className="inbox-conv-row inbox-search-result-row"
      onClick={onSelect}
    >
      <span className="inbox-conv-avatar">
        <UserAvatar
          src={user.avatar_url || undefined}
          alt={user.display_name || user.username}
          size={18}
          initials={(user.display_name || user.username)?.[0]?.toUpperCase()}
        />
      </span>
      <span className="inbox-conv-info">
        <span className="inbox-conv-name">
          {user.display_name || user.username}
        </span>
        <span className="inbox-conv-preview">@{user.username}</span>
      </span>
    </button>
  );
}

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
  const isActive = c.id === activeId;
  return (
    <button
      className={`inbox-conv-row${
        isActive ? " inbox-conv-row--active" : ""
      }${c.unread_count > 0 ? " inbox-conv-row--unread" : ""}`}
      onClick={onSelect}
    >
      <span className="inbox-conv-avatar">
        <UserAvatar
          src={other?.avatar_url || undefined}
          alt={other?.display_name || other?.username}
          size={18}
          initials={(other?.display_name ||
            other?.username)?.[0]?.toUpperCase()}
        />
      </span>
      <span className="inbox-conv-info">
        <span className="inbox-conv-name">
          {other?.display_name || other?.username || "Unknown"}
        </span>
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
      {activeConv?.other_user ? (
        <div className="inbox-chat-user">
          <Link
            to={`/users/${activeConv.other_user.id}`}
            className="inbox-chat-user-link"
          >
            <span className="inbox-chat-avatar">
              <UserAvatar
                src={activeConv.other_user.avatar_url || undefined}
                alt={
                  activeConv.other_user.display_name ||
                  activeConv.other_user.username
                }
                size={18}
              />
            </span>
            <span className="inbox-chat-username">
              {activeConv.other_user.display_name ||
                activeConv.other_user.username}
            </span>
          </Link>
          {isBlocked && (
            <span className="inbox-block-status">
              <Info size={14} />
              {blockedByCurrentUser
                ? "You blocked this user"
                : "Blocked by user"}
            </span>
          )}
        </div>
      ) : (
        <span className="inbox-chat-username">Conversation</span>
      )}
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
            {blockedByCurrentUser ? (
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
            )}
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
  const isMe = String(m.sender_id) === String(currentUserId);
  return (
    <div className={`inbox-msg${isMe ? " inbox-msg--me" : ""}`}>
      {!isMe && (
        <span className="inbox-msg-avatar">
          <UserAvatar
            src={m.sender_avatar || undefined}
            alt={m.sender_name}
            size={16}
            initials={m.sender_name?.[0]?.toUpperCase()}
          />
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
                      Open your page →
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

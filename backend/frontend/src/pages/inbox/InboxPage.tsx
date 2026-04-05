import { useEffect, useRef, useState, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { Link, useSearchParams } from "react-router-dom";
import { UserCog2Icon, Plus, InboxIcon, Search, X } from "lucide-react";
import { toast } from "sonner";
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

  const startDmWithUser = async (userId: number) => {
    try {
      const conv = await apiRequest<InboxConversation>("/inbox/conversations", {
        method: "POST",
        body: JSON.stringify({ target_user_id: userId }),
      });
      if (conv) {
        setConversations((prev) => {
          if (prev.some((c) => c.id === conv.id)) return prev;
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
                  <button
                    key={user.id}
                    className="inbox-conv-row inbox-search-result-row"
                    onClick={() => startDmWithUser(Number(user.id))}
                  >
                    <span className="inbox-conv-avatar">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.display_name || user.username}
                        />
                      ) : (
                        <UserCog2Icon size={18} />
                      )}
                    </span>
                    <span className="inbox-conv-info">
                      <span className="inbox-conv-name">
                        {user.display_name || user.username}
                      </span>
                      <span className="inbox-conv-preview">
                        @{user.username}
                      </span>
                    </span>
                  </button>
                ))}
                {searchLoadingMore && (
                  <p className="inbox-loading">Loading more…</p>
                )}
              </div>
            )}

            {/* Existing conversations (dimmed when search is active) */}
            <div className={showNewDm ? "inbox-convs-dimmed" : ""}>
              {conversations.map((c) => {
                const other = c.other_user;
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    className={`inbox-conv-row${isActive ? " inbox-conv-row--active" : ""}${c.unread_count > 0 ? " inbox-conv-row--unread" : ""}`}
                    onClick={() => {
                      setActiveId(c.id);
                      if (isMobile) setMobileView("chat");
                    }}
                  >
                    <span className="inbox-conv-avatar">
                      {other?.avatar_url ? (
                        <img
                          src={other.avatar_url}
                          alt={other.display_name || other.username}
                        />
                      ) : (
                        <UserCog2Icon size={18} />
                      )}
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
                        <span className="inbox-unread-badge">
                          {c.unread_count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
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
              <div className="inbox-chat-header">
                {isMobile && (
                  <button
                    className="inbox-back-btn"
                    onClick={() => setMobileView("list")}
                    title="Back to conversations"
                  >
                    ←
                  </button>
                )}
                {activeConv?.other_user ? (
                  <Link
                    to={`/users/${activeConv.other_user.id}`}
                    className="inbox-chat-user"
                  >
                    <span className="inbox-chat-avatar">
                      {activeConv.other_user.avatar_url ? (
                        <img src={activeConv.other_user.avatar_url} alt="" />
                      ) : (
                        <UserCog2Icon size={18} />
                      )}
                    </span>
                    <span className="inbox-chat-username">
                      {activeConv.other_user.display_name ||
                        activeConv.other_user.username}
                    </span>
                  </Link>
                ) : (
                  <span className="inbox-chat-username">Conversation</span>
                )}
              </div>

              {/* Messages */}
              <div className="inbox-feed" ref={feedRef} onScroll={handleScroll}>
                {loadingMsgs && (
                  <p className="inbox-loading">Loading messages…</p>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <p className="inbox-empty">No messages yet. Say hello!</p>
                )}
                {messages.map((m) => {
                  const isMe = String(m.sender_id) === String(currentUser?.id);
                  return (
                    <div
                      key={m.id}
                      className={`inbox-msg${isMe ? " inbox-msg--me" : ""}`}
                    >
                      {!isMe && (
                        <span className="inbox-msg-avatar">
                          {m.sender_avatar ? (
                            <img src={m.sender_avatar} alt={m.sender_name} />
                          ) : (
                            <UserCog2Icon size={16} />
                          )}
                        </span>
                      )}
                      <div className="inbox-msg-body">
                        {!isMe && (
                          <span className="inbox-msg-author">
                            {m.sender_name}
                          </span>
                        )}
                        <p className="inbox-msg-content">{m.content}</p>
                        <span
                          className="inbox-msg-time"
                          title={formatFullDateTime(m.created_at)}
                        >
                          {formatLocalTime(m.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="inbox-input-row">
                <Input
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
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default InboxPage;

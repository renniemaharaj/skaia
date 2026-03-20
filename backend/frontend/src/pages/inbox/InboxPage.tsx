import { useEffect, useRef, useState, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { Link, useSearchParams } from "react-router-dom";
import { Send, UserCog2Icon, Plus, InboxIcon } from "lucide-react";
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
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import {
  relativeTime,
  formatLocalTime,
  formatFullDateTime,
} from "../../utils/serverTime";
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

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newDmTarget, setNewDmTarget] = useState("");

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

  const sendMessage = async () => {
    if (!input.trim() || !activeId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    try {
      const msg = await apiRequest<InboxMessage>(
        `/inbox/conversations/${activeId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      if (msg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Keep last_message up to date
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId
              ? { ...c, last_message: msg, updated_at: msg.created_at }
              : c,
          ),
        );
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

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
    }
  };

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
              <input
                className="inbox-new-dm-input"
                placeholder="Username…"
                value={newDmTarget}
                autoFocus
                onChange={(e) => setNewDmTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") startNewDm();
                  if (e.key === "Escape") {
                    setShowNewDm(false);
                    setNewDmTarget("");
                  }
                }}
              />
              <button className="inbox-new-dm-send" onClick={startNewDm}>
                Go
              </button>
            </div>
          )}

          <div className="inbox-conv-list">
            {loadingConvs && <p className="inbox-loading">Loading…</p>}
            {!loadingConvs && conversations.length === 0 && (
              <p className="inbox-empty">No conversations yet.</p>
            )}
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
                <textarea
                  className="inbox-input"
                  placeholder="Write a message…"
                  rows={1}
                  maxLength={2000}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  className="inbox-send-btn"
                  disabled={!input.trim() || sending}
                  onClick={sendMessage}
                  title="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default InboxPage;

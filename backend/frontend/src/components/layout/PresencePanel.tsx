import { useState, useRef, useEffect } from "react";
import { useAtomValue } from "jotai";
import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  Users,
  ChevronDown,
  ChevronUp,
  UserCog2Icon,
  GhostIcon,
  Navigation,
  LocateFixed,
  MessageCircle,
} from "lucide-react";
import { onlineUsersAtom, type OnlineUser } from "../../atoms/presence";
import {
  currentUserAtom,
  socketAtom,
  hasPermissionAtom,
} from "../../atoms/auth";
import {
  globalChatMessagesAtom,
  type GlobalChatMessage,
} from "../../atoms/chat";
import { toast } from "sonner";
import { formatLocalTime } from "../../utils/serverTime";
import ComposerInput from "../input/Input";
import "./PresencePanel.css";

/**
 * Extensible per-row action. Add new actions to the rowActions array below.
 * Each action receives the target OnlineUser and can call navigate / socket etc.
 */
interface PresenceRowAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  /** Return true to hide this action for the given user. */
  hidden?: (u: OnlineUser) => boolean;
  handler: (u: OnlineUser) => void;
}

const PresencePanel = () => {
  const [expanded, setExpanded] = useState(
    typeof window !== "undefined" && window.innerWidth <= 720 ? false : true,
  );
  const [chatMode, setChatMode] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [mobilePanelHeight, setMobilePanelHeight] = useState(
    typeof window !== "undefined"
      ? Math.round(window.visualViewport?.height ?? window.innerHeight)
      : 0,
  );
  const prevChatLenRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const rawUsers = useAtomValue(onlineUsersAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const socket = useAtomValue(socketAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const chatMessages = useAtomValue(globalChatMessagesAtom);
  const location = useLocation();
  const navigate = useNavigate();

  // Deduplicate authenticated users (positive id) by user_id, prefer entry with name.
  // Guests have negative ids (unique per connection) — include as-is.
  // Skip any stale user_id=0 entries.
  const onlineUsers = (() => {
    const seen = new Map<number, OnlineUser>();
    for (const u of rawUsers) {
      if (u.user_id === 0) continue;
      if (u.user_id < 0) {
        // guest — always unique, no dedup needed
        seen.set(u.user_id, u);
        continue;
      }
      const existing = seen.get(u.user_id);
      if (!existing || (u.user_name && !existing.user_name)) {
        seen.set(u.user_id, u);
      }
    }
    return Array.from(seen.values()).slice(0, 100);
  })();

  // Users on the same route as the viewer
  const here = onlineUsers.filter((u) => u.route === location.pathname);
  // All other online registered users
  const elsewhere = onlineUsers.filter((u) => u.route !== location.pathname);

  const total = onlineUsers.length;

  // ── Row actions ───────────────────────────────────────────────
  // Add future actions here — they appear on hover in declaration order.
  const rowActions: PresenceRowAction[] = [
    {
      key: "dm",
      icon: <MessageCircle size={11} />,
      title: "Send message",
      hidden: (u) =>
        u.user_id < 0 ||
        !currentUser ||
        String(u.user_id) === String(currentUser.id),
      handler: (u) => navigate(`/inbox?with=${u.user_id}`),
    },
    {
      key: "tp_to",
      icon: <Navigation size={11} />,
      title: "Go to their location",
      hidden: (u) =>
        !currentUser ||
        !u.route ||
        (u.user_id > 0 && String(u.user_id) === String(currentUser.id)),
      handler: (u) => navigate(u.route),
    },
    {
      key: "tp_here",
      icon: <LocateFixed size={11} />,
      title: "Summon here",
      hidden: (u) =>
        !hasPermission("presence.tp-here") ||
        (u.user_id > 0 && String(u.user_id) === String(currentUser?.id)),
      handler: (u) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            type: "tp",
            user_id: currentUser?.id ? Number(currentUser.id) : 0,
            payload: { target_user_id: u.user_id, route: location.pathname },
          }),
        );
        toast(`${u.user_name || "User"} summoned`, {
          description: `Teleporting them to ${location.pathname}`,
          duration: 4000,
          icon: "⚡",
        });
      },
    },
  ];

  // ───────────────────────────────────────────────────────────────

  // Auto-scroll chat feed to bottom when new messages arrive
  useEffect(() => {
    if (chatMode && expanded) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatMode, expanded]);

  // Track unread count while on the members tab.
  // Only count a delta of exactly 1 — history loads arrive as a big batch
  // and should NOT mark the chat tab as having new messages.
  useEffect(() => {
    const delta = chatMessages.length - prevChatLenRef.current;
    prevChatLenRef.current = chatMessages.length;
    if (delta === 1 && !chatMode) {
      setChatUnread((n) => n + 1);
    }
  }, [chatMessages.length, chatMode]);

  // Ensure the mobile expanded panel resizes with the viewport
  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      setMobilePanelHeight(Math.round(height));
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("scroll", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("scroll", updateHeight);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────

  const UserRow = ({ u, dim }: { u: OnlineUser; dim?: boolean }) => {
    const isGuest = u.user_id < 0;
    const isMe = !isGuest && String(u.user_id) === String(currentUser?.id);
    const visibleActions = rowActions.filter((a) => !a.hidden?.(u));

    const actions = visibleActions.length > 0 && (
      <span
        className="pp-actions"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {visibleActions.map((action) => (
          <button
            key={action.key}
            className={`pp-action-btn pp-action-btn--${action.key}`}
            title={action.title}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              action.handler(u);
            }}
          >
            {action.icon}
          </button>
        ))}
      </span>
    );

    const inner = (
      <>
        <span className="pp-avatar">
          {isGuest ? (
            <GhostIcon size={14} />
          ) : u.avatar ? (
            <img src={u.avatar} alt={u.user_name} />
          ) : (
            <UserCog2Icon size={16} />
          )}
        </span>
        <span className="pp-name pp-guest">
          {isGuest ? "Guest" : u.user_name || `#${u.user_id}`}
        </span>
        {isMe && <span className="pp-you">you</span>}
        {dim && <span className="pp-route">{u.route}</span>}
        {actions}
      </>
    );

    if (isGuest) {
      return (
        <span
          className={`pp-user-row pp-guest-row${dim ? " pp-dim" : ""}`}
          title={dim ? u.route : undefined}
        >
          {inner}
        </span>
      );
    }
    return (
      <Link
        to={`/users/${u.user_id}`}
        className={`pp-user-row${dim ? " pp-dim" : ""}${isMe ? " pp-me" : ""}`}
        title={dim ? u.route : undefined}
      >
        {inner}
      </Link>
    );
  };

  // Helper: render a single chat bubble
  const ChatBubble = ({ msg }: { msg: GlobalChatMessage }) => {
    const isMe =
      !msg.is_guest && String(msg.user_id) === String(currentUser?.id);
    const time = formatLocalTime(msg.created_at);
    const nameEl = msg.is_guest ? (
      <span className="pp-chat-author pp-chat-author--guest">Guest</span>
    ) : (
      <Link to={`/users/${msg.user_id}`} className="pp-chat-author">
        {msg.user_name || `#${msg.user_id}`}
      </Link>
    );
    return (
      <div className={`pp-chat-bubble${isMe ? " pp-chat-bubble--me" : ""}`}>
        <div className="pp-chat-meta">
          {nameEl}
          <span className="pp-chat-time">{time}</span>
        </div>
        <p className="pp-chat-content">{msg.content}</p>
      </div>
    );
  };

  const panelStyle =
    expanded && mobilePanelHeight > 0
      ? ({
          "--presence-panel-height": `${mobilePanelHeight}px`,
        } as React.CSSProperties)
      : undefined;

  return (
    <div
      className={`presence-panel${expanded ? " presence-panel--expanded" : ""}`}
      style={panelStyle}
    >
      {/* Control bar: mode tabs + expand toggle */}
      <div className="pp-controls">
        <div className="pp-tabs">
          <button
            className={`pp-tab${!chatMode ? " pp-tab--active" : ""}`}
            onClick={() => setChatMode(false)}
            title="Online members"
          >
            <Users size={13} />
            <span className="pp-count">{total}</span>
          </button>
          <button
            className={`pp-tab${chatMode ? " pp-tab--active" : ""}${chatUnread > 0 && !chatMode ? " pp-tab--has-unread" : ""}`}
            onClick={() => {
              setChatMode(true);
              setChatUnread(0);
            }}
            title="Global chat"
          >
            <MessageCircle size={13} />
            {chatUnread > 0 && !chatMode && (
              <span className="pp-chat-badge">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
        </div>
        <button
          className="pp-chevron"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {/* Expanded panel */}
      <div
        className={`pp-body${expanded ? " pp-open" : ""}${chatMode ? " pp-body--chat" : ""}`}
      >
        {!chatMode ? (
          /* ── Members tab ── */
          <div className="pp-scroll">
            {here.length > 0 && (
              <>
                <p className="pp-section-label">On this page</p>
                {here.map((u) => (
                  <UserRow key={u.user_id} u={u} />
                ))}
              </>
            )}

            {elsewhere.length > 0 && (
              <>
                <p className="pp-section-label pp-section-label--elsewhere">
                  Elsewhere
                </p>
                {elsewhere.map((u) => (
                  <UserRow key={u.user_id} u={u} dim />
                ))}
              </>
            )}

            {total === 0 && (
              <p className="pp-empty">No one online right now.</p>
            )}
          </div>
        ) : (
          /* ── Chat tab ── */
          <>
            <div className="pp-chat-feed">
              {chatMessages.length === 0 && (
                <p className="pp-empty">No messages yet. Say hi!</p>
              )}
              {chatMessages.map((msg) => (
                <ChatBubble key={msg.id} msg={msg} />
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="pp-chat-input-row">
              <ComposerInput
                handleSend={(msg) => {
                  if (!socket || socket.readyState !== WebSocket.OPEN) return;
                  socket.send(
                    JSON.stringify({
                      type: "global:chat",
                      payload: { content: msg },
                    }),
                  );
                }}
                placeholder="Say something…"
                maxLength={500}
                maxRows={3}
                compact
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PresencePanel;

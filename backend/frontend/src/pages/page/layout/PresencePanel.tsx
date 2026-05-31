import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  Users,
  ChevronDown,
  ChevronUp,
  GhostIcon,
  Navigation,
  LocateFixed,
  MessageCircle,
  Gauge,
  ShieldCheck,
  Mic,
} from "lucide-react";
import { onlineUsersAtom, type OnlineUser } from "../../../atoms/presence";
import UserAvatar from "../../../components/user/UserAvatar";
import { apiRequest, adminTriggerMFAChallenge } from "../../../utils/api";
import {
  currentUserAtom,
  socketAtom,
  hasPermissionAtom,
} from "../../../atoms/auth";
import {
  globalChatMessagesAtom,
  type GlobalChatMessage,
} from "../../../atoms/chat";
import { toast } from "sonner";
import { formatLocalTime } from "../../../utils/serverTime";
import ComposerInput from "../../../components/input/Input";
import "./PresencePanel.css";
import VoicePanel from "./VoicePanel";

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
  const [activeTab, setActiveTab] = useState<'members' | 'chat' | 'voice'>('members');
  const [hasOpenedVoice, setHasOpenedVoice] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth <= 720,
  );
  const [mobilePanelHeight, setMobilePanelHeight] = useState(
    typeof window !== "undefined"
      ? Math.round(window.visualViewport?.height ?? window.innerHeight)
      : 0,
  );
  const [slowModeEnabled, setSlowModeEnabled] = useState(false);
  const [slowModeInterval, setSlowModeInterval] = useState(10);
  const [slowModeLoading, setSlowModeLoading] = useState(true);
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
    {
      key: "mfa_challenge",
      icon: <ShieldCheck size={11} />,
      title: "Trigger MFA challenge",
      hidden: (u) =>
        !hasPermission("home.manage") ||
        u.user_id < 0 ||
        (u.user_id > 0 && String(u.user_id) === String(currentUser?.id)),
      handler: async (u) => {
        try {
          await adminTriggerMFAChallenge(String(u.user_id));
          toast.success(`MFA challenge sent to ${u.user_name || "User"}`);
        } catch (err: any) {
          toast.error(err.message || "Failed to trigger MFA challenge");
        }
      },
    },
  ];

  // ───────────────────────────────────────────────────────────────

  // Auto-scroll chat feed to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === 'chat' && expanded) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab, expanded]);

  // Track unread count while on the members tab.
  // Only count a delta of exactly 1 — history loads arrive as a big batch
  // and should NOT mark the chat tab as having new messages.
  useEffect(() => {
    const delta = chatMessages.length - prevChatLenRef.current;
    prevChatLenRef.current = chatMessages.length;
    if (delta === 1 && activeTab !== 'chat') {
      setChatUnread((n) => n + 1);
    }
  }, [chatMessages.length, activeTab]);

  // Ensure the mobile expanded panel resizes with the viewport
  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      setMobilePanelHeight(Math.round(height));
      setIsMobile(window.innerWidth <= 720);
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

  const canManagePresenceSettings = hasPermission("home.manage");
  const loadSlowMode = useCallback(async () => {
    if (!canManagePresenceSettings) return;
    setSlowModeLoading(true);
    try {
      const data = await apiRequest<{ enabled: boolean; interval: number }>(
        "/config/comment-slowmode",
      );
      setSlowModeEnabled(data?.enabled ?? false);
      setSlowModeInterval(data?.interval ?? 10);
    } catch {
      // ignore
    } finally {
      setSlowModeLoading(false);
    }
  }, [canManagePresenceSettings]);

  const toggleSlowMode = useCallback(async () => {
    if (!canManagePresenceSettings) return;
    setSlowModeLoading(true);
    try {
      const data = await apiRequest<{ enabled: boolean; interval: number }>(
        "/config/comment-slowmode",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: !slowModeEnabled,
            interval: slowModeInterval || 10,
          }),
        },
      );
      setSlowModeEnabled(data?.enabled ?? false);
      setSlowModeInterval(data?.interval ?? 10);
      toast.success(
        data?.enabled
          ? "Comment slow mode enabled"
          : "Comment slow mode disabled",
      );
    } catch {
      toast.error("Failed to update comment slow mode");
    } finally {
      setSlowModeLoading(false);
    }
  }, [canManagePresenceSettings, slowModeEnabled, slowModeInterval]);

  useEffect(() => {
    if (!canManagePresenceSettings) return;
    void loadSlowMode();

    const handler = (e: Event) => {
      const { action, data } = (
        e as CustomEvent<{ action: string; data?: any }>
      ).detail;
      if (action === "comment_slowmode_updated") {
        setSlowModeEnabled(data?.enabled ?? false);
        setSlowModeInterval(data?.interval ?? 10);
      }
    };
    window.addEventListener("config:live:event", handler);
    return () => window.removeEventListener("config:live:event", handler);
  }, [canManagePresenceSettings, loadSlowMode]);

  useEffect(() => {
    if (!expanded || !isMobile) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded, isMobile]);

  // ───────────────────────────────────────────────────────────────

  const UserRow = ({ u, dim }: { u: OnlineUser; dim?: boolean }) => {
    const isGuest = u.user_id < 0;
    const isMe = !isGuest && String(u.user_id) === String(currentUser?.id);
    const visibleActions = rowActions.filter((a) => !a.hidden?.(u));

    const [isSpeaking, setIsSpeaking] = useState(false);

    useEffect(() => {
      let timeout: any;
      const handleSpeaking = (e: any) => {
        if (e.detail === String(u.user_id)) {
          setIsSpeaking(true);
          clearTimeout(timeout);
          timeout = setTimeout(() => setIsSpeaking(false), 300);
        }
      };
      window.addEventListener("voice:speaking", handleSpeaking);
      return () => {
        window.removeEventListener("voice:speaking", handleSpeaking);
        clearTimeout(timeout);
      };
    }, [u.user_id]);

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
        <span className={`pp-avatar${isSpeaking ? " pp-avatar--speaking" : ""}`}>
          {isGuest ? (
            <GhostIcon size={14} />
          ) : (
            <UserAvatar
              src={u.avatar || undefined}
              alt={u.user_name}
              size={16}
              initials={u.user_name?.[0]?.toUpperCase()}
            />
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
            className={`pp-tab${activeTab === 'members' ? " pp-tab--active" : ""}`}
            onClick={() => setActiveTab('members')}
            title="Online members"
          >
            <Users size={13} />
            <span className="pp-count">{total}</span>
          </button>
          <button
            className={`pp-tab${activeTab === 'chat' ? " pp-tab--active" : ""}${chatUnread > 0 && activeTab !== 'chat' ? " pp-tab--has-unread" : ""}`}
            onClick={() => {
              setActiveTab('chat');
              setChatUnread(0);
            }}
            title="Global chat"
          >
            <MessageCircle size={13} />
            {chatUnread > 0 && activeTab !== 'chat' && (
              <span className="pp-chat-badge">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
          <button
            className={`pp-tab${activeTab === 'voice' ? " pp-tab--active" : ""}`}
            onClick={() => {
              setHasOpenedVoice(true);
              setActiveTab('voice');
            }}
            title="Voice & Media"
          >
            <Mic size={13} strokeWidth={2.5} />
          </button>
        </div>
        {canManagePresenceSettings && (
          <button
            type="button"
            className={`pp-chevron pp-slowmode-btn${slowModeEnabled ? " pp-slowmode-btn--active" : ""}`}
            onClick={toggleSlowMode}
            disabled={slowModeLoading}
            title={
              slowModeLoading
                ? "Loading…"
                : slowModeEnabled
                  ? `Slow mode on — ${slowModeInterval}s`
                  : "Enable slow mode"
            }
          >
            <Gauge size={13} />
          </button>
        )}
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
        className={`pp-body${expanded ? " pp-open" : ""}${activeTab === 'chat' ? " pp-body--chat" : ""}${activeTab === 'voice' ? " pp-body--voice" : ""}`}
      >
        <div style={{ display: activeTab === 'members' ? 'block' : 'none' }} className="pp-scroll">
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

        <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%', minHeight: 0, flex: 1 }}>
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
        </div>

        <div style={{ display: activeTab === 'voice' ? 'block' : 'none' }} className="pp-scroll pp-scroll--flush">
          {hasOpenedVoice && <VoicePanel />}
        </div>
      </div>
    </div>
  );
};

export default PresencePanel;

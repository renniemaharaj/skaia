import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  ChevronDown,
  ChevronUp,
  Gauge,
  GhostIcon,
  LocateFixed,
  MessageCircle,
  Mic,
  Navigation,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { currentUserAtom, hasPermissionAtom, socketAtom } from "../../../atoms/auth";
import { type GlobalChatMessage, globalChatMessagesAtom } from "../../../atoms/chat";
import { seoAtom } from "../../../atoms/config";
import { mediaStateAtom } from "../../../atoms/media";
import {
  type OnlineUser,
  pendingTpUserAtom,
  presencePanelExpandedAtom,
  layoutChildrenAtom,
  isPresenceSplitModeAtom,
} from "../../../atoms/presence";
import { enlargedStreamIdAtom } from "../../../atoms/voice";

import { adminTriggerMFAChallenge, apiRequest } from "../../../utils/api";
import { formatLocalTime } from "../../../utils/serverTime";
import { sendWebSocketMessage } from "../../../utils/wsProtobuf";
import ComposerInput from "../../input/Input";
import UserAvatar from "../../user/UserAvatar";
import UserInlineCard from "../../user/UserInlineCard";
import UserProfileOverlay from "../../user/UserProfileOverlay";
import { usePresenceUsers } from "../../../hooks/usePresenceUsers";
import "./PresencePanel.css";
// Lazy-loaded: opened only on user interaction, so no reason to bloat the initial payload.
const PhysicsControls = lazy(() => import("./PhysicsControls"));
const VoicePanel = lazy(() => import("./VoicePanel"));

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

type DefconThreatLevel = "low" | "guarded" | "elevated" | "high" | "critical";

interface DefconInfo {
  ips_jailed: number;
  distinct_ips_tracked: number;
  citizens: number;
  limiter_state: number;
  threat_level: DefconThreatLevel;
}

// ---------------------------------------------------------------------------
// Memoized sub-components hoisted to module scope.
// Defined OUTSIDE PresencePanel so React sees a stable component identity
// across parent re-renders (cursor updates, theme changes, etc.) and never
// destroys / remounts the existing DOM nodes unnecessarily.
// ---------------------------------------------------------------------------

interface UserRowProps {
  u: OnlineUser;
  dim?: boolean;
  currentUserId?: string | number;
  rowActions: PresenceRowAction[];
}

const UserRow = memo(({ u, dim, currentUserId, rowActions }: UserRowProps) => {
  const isGuest = u.user_id < 0;
  const isMe = !isGuest && String(u.user_id) === String(currentUserId);
  const visibleActions = rowActions.filter(a => !a.hidden?.(u));

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
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={e => e.stopPropagation()}
    >
      {visibleActions.map(action => (
        <button
          type="button"
          key={action.key}
          className={`pp-action-btn pp-action-btn--${action.key}`}
          title={action.title}
          onClick={e => {
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
          <UserProfileOverlay
            userId={u.user_id}
            fallbackName={u.user_name}
            fallbackAvatar={u.avatar || undefined}
            disableClick={true}
          >
            <div style={{ display: "flex", width: "100%", height: "100%" }}>
              <UserAvatar
                src={u.avatar || undefined}
                alt={u.user_name}
                size={22}
                initials={u.user_name?.[0]?.toUpperCase()}
              />
            </div>
          </UserProfileOverlay>
        )}
      </span>
      <span className="pp-name pp-guest">{isGuest ? "Guest" : u.user_name || `#${u.user_id}`}</span>
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
});

UserRow.displayName = "PresenceUserRow";

interface ChatBubbleProps {
  msg: GlobalChatMessage;
  currentUserId?: string | number;
  isContinuation?: boolean;
}

const ChatBubble = memo(({ msg, currentUserId, isContinuation }: ChatBubbleProps) => {
  const isMe = !msg.is_guest && String(msg.user_id) === String(currentUserId);
  const time = formatLocalTime(msg.created_at);
  const isSystemEvent = msg.kind === "join" || msg.kind === "leave";
  const userCard = (
    <UserInlineCard
      userId={msg.is_guest ? undefined : msg.user_id}
      name={msg.is_guest ? msg.user_name || "Guest" : msg.user_name || `#${msg.user_id}`}
      avatar={msg.avatar || undefined}
      roles={msg.roles}
      isGuest={msg.is_guest}
      compact
    />
  );

  if (isSystemEvent) {
    const Icon = msg.kind === "join" ? ArrowRight : ArrowLeft;
    return (
      <div className={`pp-chat-system${isContinuation ? " pp-chat-system--continuation" : ""}`}>
        {!isContinuation && (
          <div className="pp-chat-meta">
            {userCard}
            <span className="pp-chat-time">{time}</span>
          </div>
        )}
        <div className="pp-chat-content pp-chat-system-content">
          <span className={`pp-chat-system__icon pp-chat-system__icon--${msg.kind}`}>
            <Icon size={13} />
          </span>
          <span className="pp-chat-system__text">{msg.kind === "join" ? "joined" : "left"}</span>
          {isContinuation && <span className="pp-chat-time pp-chat-time--inline">{time}</span>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pp-chat-bubble${isMe ? " pp-chat-bubble--me" : ""}${isContinuation ? " pp-chat-bubble--continuation" : ""}`}
    >
      {!isContinuation && (
        <div className="pp-chat-meta">
          {userCard}
          <span className="pp-chat-time">{time}</span>
        </div>
      )}
      <p className="pp-chat-content">
        {isContinuation && <span className="pp-chat-time pp-chat-time--hover">{time}</span>}
        {msg.content}
      </p>
    </div>
  );
});

ChatBubble.displayName = "PresenceChatBubble";

const PresencePanel = () => {
  const [expanded, setExpanded] = useAtom(presencePanelExpandedAtom);
  const enlargedStreamId = useAtomValue(enlargedStreamIdAtom);
  const [activeTab, setActiveTab] = useState<"members" | "chat" | "voice" | "physics" | "defcon">(
    "members"
  );
  const [defconInfo, setDefconInfo] = useState<DefconInfo | null>(null);
  const [defconResetting, setDefconResetting] = useState(false);
  const [hasOpenedVoice, setHasOpenedVoice] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth <= 720
  );
  const [mobilePanelHeight, setMobilePanelHeight] = useState(
    typeof window !== "undefined"
      ? Math.round(window.visualViewport?.height ?? window.innerHeight)
      : 0
  );
  const [slowModeEnabled, setSlowModeEnabled] = useState(false);
  const [slowModeInterval, setSlowModeInterval] = useState(10);
  const [slowModeLoading, setSlowModeLoading] = useState(true);
  const prevChatLenRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const setPendingTpUser = useSetAtom(pendingTpUserAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const socket = useAtomValue(socketAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const chatMessages = useAtomValue(globalChatMessagesAtom);
  const mediaState = useAtomValue(mediaStateAtom);
  const seo = useAtomValue(seoAtom);
  const isMediaActive = mediaState?.queue && mediaState.queue.length > 0;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeTab === "defcon") {
      // Listen for WebSocket pushes from the backend
      const handler = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "defcon:telemetry") {
            setDefconInfo(msg.payload);
          }
        } catch {}
      };

      if (socket) {
        socket.addEventListener("message", handler);
      }

      // Fetch initial cached state
      apiRequest<DefconInfo>("/defcon/telemetry").then(setDefconInfo).catch(console.error);

      return () => {
        if (socket) {
          socket.removeEventListener("message", handler);
        }
      };
    }
  }, [activeTab, socket]);

  const { here, elsewhere, total } = usePresenceUsers();

  const resetDefcon = useCallback(async () => {
    if (defconResetting) return;
    setDefconResetting(true);
    try {
      const resp = await apiRequest<{ stats?: DefconInfo }>("/defcon/reset", {
        method: "POST",
      });
      if (resp?.stats) {
        setDefconInfo(resp.stats);
      } else {
        const fresh = await apiRequest<DefconInfo>("/defcon/telemetry");
        setDefconInfo(fresh);
      }
      toast.success("DEFCON reset");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset DEFCON");
    } finally {
      setDefconResetting(false);
    }
  }, [defconResetting]);

  // Row actions — wrapped in useMemo so the array reference is stable across
  // renders, allowing React.memo on UserRow to actually skip re-renders.
  // Add future actions here; they appear on hover in declaration order.
  const rowActions: PresenceRowAction[] = useMemo(
    () => [
      {
        key: "dm",
        icon: <MessageCircle size={11} />,
        title: "Send message",
        hidden: u => u.user_id < 0 || !currentUser || String(u.user_id) === String(currentUser.id),
        handler: u => navigate(`/inbox?with=${u.user_id}`),
      },
      {
        key: "tp_to",
        icon: <Navigation size={11} />,
        title: "Go to their location",
        hidden: u =>
          !currentUser ||
          !u.route ||
          (u.user_id > 0 && String(u.user_id) === String(currentUser.id)),
        handler: u => {
          setPendingTpUser(u.user_id);
          navigate(u.route);
        },
      },
      {
        key: "tp_here",
        icon: <LocateFixed size={11} />,
        title: "Summon here",
        hidden: u =>
          !hasPermission("presence.tp-here") ||
          (u.user_id > 0 && String(u.user_id) === String(currentUser?.id)),
        handler: u => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
          sendWebSocketMessage(socket, {
            type: "tp",
            user_id: currentUser?.id ? Number(currentUser.id) : 0,
            payload: { target_user_id: u.user_id, route: location.pathname },
          });
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
        hidden: u =>
          !hasPermission("home.manage") ||
          u.user_id < 0 ||
          (u.user_id > 0 && String(u.user_id) === String(currentUser?.id)),
        handler: async u => {
          try {
            await adminTriggerMFAChallenge(String(u.user_id));
            toast.success(`Successfully triggered challenge for ${u.user_name || "User"}`);
          } catch (err: any) {
            toast.error(`Failed to trigger challenge: ${err.message || "Unknown error"}`);
          }
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, navigate, setPendingTpUser, hasPermission, socket, location.pathname]
  );

  // Auto-scroll chat feed to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === "chat" && expanded) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab, expanded]);

  // Track unread count while on the members tab.
  // Only count a delta of exactly 1 - history loads arrive as a big batch
  // and should NOT mark the chat tab as having new messages.
  useEffect(() => {
    const delta = chatMessages.length - prevChatLenRef.current;
    prevChatLenRef.current = chatMessages.length;
    if (delta === 1 && activeTab !== "chat") {
      setChatUnread(n => n + 1);
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
        "/config/comment-slowmode"
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
        }
      );
      setSlowModeEnabled(data?.enabled ?? false);
      setSlowModeInterval(data?.interval ?? 10);
      toast.success(data?.enabled ? "Comment slow mode enabled" : "Comment slow mode disabled");
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
      const { action, data } = (e as CustomEvent<{ action: string; data?: any }>).detail;
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

  const panelStyle =
    expanded && mobilePanelHeight > 0
      ? ({
          "--presence-panel-height": `${mobilePanelHeight}px`,
        } as React.CSSProperties)
      : undefined;

  const isPanelSplit = expanded && !isMobile;
  const isRoutingLayout = isPanelSplit && !enlargedStreamId;
  const setPresenceSplitMode = useSetAtom(isPresenceSplitModeAtom);
  const layoutChildren = useAtomValue(layoutChildrenAtom);

  useEffect(() => {
    setPresenceSplitMode(isRoutingLayout);
    return () => setPresenceSplitMode(false);
  }, [isRoutingLayout, setPresenceSplitMode]);

  return (
    <div
      className={`presence-panel${expanded ? " presence-panel--expanded" : ""}${isPanelSplit ? " pp-split-mode" : ""}`}
      style={panelStyle as any}
      id="presence-panel-root"
    >
      <div className="pp-wrapper">
        {/* Control bar: mode tabs + expand toggle */}
        <div className="pp-controls">
          <div className="pp-tabs">
            <button
              type="button"
              className={`pp-tab${activeTab === "members" ? " pp-tab--active" : ""}`}
              onClick={() => setActiveTab("members")}
              title="Online members"
            >
              <Users size={13} />
              <span className="pp-count">{total}</span>
            </button>
            <button
              type="button"
              className={`pp-tab${activeTab === "chat" ? " pp-tab--active" : ""}${chatUnread > 0 && activeTab !== "chat" ? " pp-tab--has-unread" : ""}`}
              onClick={() => {
                setActiveTab("chat");
                setChatUnread(0);
              }}
              title="Global chat"
            >
              <MessageCircle size={13} />
              {chatUnread > 0 && activeTab !== "chat" && (
                <span className="pp-chat-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>
              )}
            </button>
            <button
              type="button"
              className={`pp-tab${activeTab === "voice" ? " pp-tab--active" : ""}`}
              onClick={() => {
                setHasOpenedVoice(true);
                setActiveTab("voice");
              }}
              title="Voice & Media"
            >
              <Mic size={13} strokeWidth={2.5} />
            </button>
            {seo?.particle_style === "gravity" && (
              <button
                type="button"
                className={`pp-tab${activeTab === "physics" ? " pp-tab--active" : ""}`}
                onClick={() => setActiveTab("physics")}
                title="Physics Engine Controls"
              >
                <Atom size={13} strokeWidth={2.5} />
              </button>
            )}
            {hasPermission("admin.general") && (
              <button
                type="button"
                className={`pp-tab pp-tab--defcon${defconInfo?.threat_level ? ` defcon-threat--${defconInfo.threat_level}` : ""}${activeTab === "defcon" ? " pp-tab--active" : ""}`}
                onClick={() => setActiveTab("defcon")}
                title={`DEFCON Telemetry${defconInfo ? `: ${defconInfo.threat_level}` : ""}`}
              >
                <ShieldCheck size={13} strokeWidth={2.5} />
              </button>
            )}
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
            type="button"
            className="pp-chevron"
            onClick={() => setExpanded(v => !v)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>

        {/* Expanded panel */}
        <div
          className={`pp-body${expanded ? " pp-open" : ""}${activeTab === "chat" ? " pp-body--chat" : ""}${activeTab === "voice" ? " pp-body--voice" : ""}${activeTab === "voice" && isMediaActive ? " pp-body--voice-media-active" : ""}`}
        >
          <div
            style={{ display: activeTab === "members" ? "block" : "none" }}
            className="pp-scroll"
          >
            {here.length > 0 && (
              <>
                <p className="pp-section-label">On this page</p>
                {here.map(u => (
                  <UserRow
                    key={u.user_id}
                    u={u}
                    currentUserId={currentUser?.id}
                    rowActions={rowActions}
                  />
                ))}
              </>
            )}

            {elsewhere.length > 0 && (
              <>
                <p className="pp-section-label pp-section-label--elsewhere">Elsewhere</p>
                {elsewhere.map(u => (
                  <UserRow
                    key={u.user_id}
                    u={u}
                    dim
                    currentUserId={currentUser?.id}
                    rowActions={rowActions}
                  />
                ))}
              </>
            )}

            {total === 0 && <p className="pp-empty">No one online right now.</p>}
          </div>

          <div
            style={{
              display: activeTab === "chat" ? "flex" : "none",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
              flex: 1,
            }}
          >
            <div className="pp-chat-feed">
              {chatMessages.length === 0 && <p className="pp-empty">No messages yet. Say hi!</p>}
              {chatMessages.map((msg, idx) => {
                const prevMsg = chatMessages[idx - 1];
                const isSameUser =
                  prevMsg &&
                  String(prevMsg.user_id) === String(msg.user_id) &&
                  prevMsg.is_guest === msg.is_guest;
                const isRecent =
                  prevMsg &&
                  new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() <
                    5 * 60 * 1000;
                const isContinuation = isSameUser && isRecent;
                return (
                  <ChatBubble
                    key={msg.id}
                    msg={msg}
                    currentUserId={currentUser?.id}
                    isContinuation={isContinuation}
                  />
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="pp-chat-input-row">
              <ComposerInput
                handleSend={msg => {
                  if (!socket || socket.readyState !== WebSocket.OPEN) return;
                  sendWebSocketMessage(socket, {
                    type: "global:chat",
                    payload: { content: msg },
                  });
                }}
                placeholder="Say something…"
                maxLength={500}
                maxRows={3}
                compact
              />
            </div>
          </div>

          <div
            style={{ display: activeTab === "voice" ? "block" : "none" }}
            className="pp-scroll pp-scroll--flush"
          >
            {hasOpenedVoice && (
              <Suspense fallback={null}>
                <VoicePanel
                  voiceOnly={location.pathname.startsWith("/view-thread/") && !isMobile}
                />
              </Suspense>
            )}
          </div>

          <div
            style={{
              display: activeTab === "physics" ? "flex" : "none",
              flexDirection: "column",
            }}
            className="pp-scroll"
          >
            {activeTab === "physics" && (
              <Suspense fallback={null}>
                <PhysicsControls />
              </Suspense>
            )}
          </div>

          <div
            style={{
              display: activeTab === "defcon" ? "block" : "none",
              padding: "1rem",
            }}
            className="pp-scroll"
          >
            {activeTab === "defcon" && defconInfo && (
              <div
                className={`defcon-telemetry-tile defcon-threat--${defconInfo.threat_level}`}
                style={{
                  fontSize: "0.85rem",
                  fontFamily: "var(--font-mono, monospace)",
                  textAlign: "left",
                }}
              >
                <div className="defcon-telemetry-header">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flex: "1 1 100%",
                    }}
                  >
                    <span>[ DEFCON THREAT TELEMETRY ]</span>
                    <span className="defcon-threat-label" style={{ marginLeft: 0 }}>
                      {defconInfo.threat_level}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`defcon-reset-toggle${defconResetting ? " defcon-reset-toggle--active" : ""}`}
                    style={{ flex: "1 1 100%", justifyContent: "center" }}
                    onClick={resetDefcon}
                    disabled={defconResetting}
                    title="Reset DEFCON telemetry"
                    aria-label="Reset DEFCON telemetry"
                  >
                    <RotateCcw size={12} />
                    <span>{defconResetting ? "Resetting" : "Reset"}</span>
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ color: "var(--text-secondary, #aaa)" }}>› Active Jails:</span>
                  <strong style={{ color: "var(--text-primary, #fff)" }}>
                    {defconInfo.ips_jailed}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ color: "var(--text-secondary, #aaa)" }}>
                    › Tracked Signatures:
                  </span>
                  <strong style={{ color: "var(--text-primary, #fff)" }}>
                    {defconInfo.distinct_ips_tracked}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ color: "var(--text-secondary, #aaa)" }}>› Cleared Citizens:</span>
                  <strong style={{ color: "var(--text-primary, #fff)" }}>
                    {defconInfo.citizens}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "1rem",
                    paddingTop: "1rem",
                    borderTop: "1px dashed var(--border-color, rgba(255,255,255,0.2))",
                  }}
                >
                  <span style={{ color: "var(--text-secondary, #aaa)" }}>› Dynamic Threshold:</span>
                  <strong style={{ color: "var(--text-primary, #fff)" }}>
                    {defconInfo.limiter_state} req/m
                  </strong>
                </div>
              </div>
            )}
            {activeTab === "defcon" && !defconInfo && (
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.85rem",
                  textAlign: "center",
                }}
              >
                Loading telemetry...
              </div>
            )}
          </div>
        </div>
      </div>

      {isRoutingLayout && (
        <div
          className="pp-split-content-area layout-main"
          style={{
            flex: 1,
            position: "relative",
            overflowY: "auto",
            padding: "0 24px",
            maxHeight: "100vh",
          }}
        >
          {layoutChildren}
        </div>
      )}
    </div>
  );
};

export default PresencePanel;

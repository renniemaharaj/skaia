import { useState } from "react";
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
} from "lucide-react";
import { onlineUsersAtom, type OnlineUser } from "../atoms/presence";
import { currentUserAtom, socketAtom, hasPermissionAtom } from "../atoms/auth";
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
  const [expanded, setExpanded] = useState(true);
  const rawUsers = useAtomValue(onlineUsersAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const socket = useAtomValue(socketAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
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
      },
    },
  ];

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
            className="pp-action-btn"
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

  return (
    <div className="presence-panel">
      {/* Toggle button */}
      <button
        className="pp-toggle"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Hide online users" : "Show online users"}
      >
        <Users size={15} />
        <span className="pp-count">{total}</span>
        {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>

      {/* Expanded panel */}
      <div className={`pp-body${expanded ? " pp-open" : ""}`}>
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

          {total === 0 && <p className="pp-empty">No one online right now.</p>}
        </div>
      </div>
    </div>
  );
};

export default PresencePanel;

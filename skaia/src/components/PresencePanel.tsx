import { useState } from "react";
import { useAtomValue } from "jotai";
import { useLocation, Link } from "react-router-dom";
import { Users, ChevronDown, ChevronUp, UserCog2Icon } from "lucide-react";
import { onlineUsersAtom, type OnlineUser } from "../atoms/presence";
import { currentUserAtom } from "../atoms/auth";
import "./PresencePanel.css";

const PresencePanel = () => {
  const [expanded, setExpanded] = useState(true);
  const rawUsers = useAtomValue(onlineUsersAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const location = useLocation();

  // Deduplicate by user_id (prefer entry with a name), filter anonymous, cap at 100
  const onlineUsers = (() => {
    const seen = new Map<number, OnlineUser>();
    for (const u of rawUsers) {
      if (u.user_id === 0) continue;
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

  const UserRow = ({ u, dim }: { u: OnlineUser; dim?: boolean }) => {
    const isMe = String(u.user_id) === String(currentUser?.id);
    return (
      <Link
        to={`/users/${u.user_id}`}
        className={`pp-user-row${dim ? " pp-dim" : ""}${isMe ? " pp-me" : ""}`}
        title={dim ? u.route : undefined}
      >
        <span className="pp-avatar">
          {u.avatar ? (
            <img src={u.avatar} alt={u.user_name} />
          ) : (
            <UserCog2Icon size={16} />
          )}
        </span>
        <span className="pp-name">{u.user_name || `#${u.user_id}`}</span>
        {isMe && <span className="pp-you">you</span>}
        {dim && <span className="pp-route">{u.route}</span>}
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

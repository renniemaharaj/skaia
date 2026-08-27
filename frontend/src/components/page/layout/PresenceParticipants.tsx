import { ArrowLeft, ArrowRight, GhostIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GlobalChatMessage } from "../../../atoms/chat";
import type { OnlineUser } from "../../../atoms/presence";
import { formatLocalTime } from "../../../utils/serverTime";
import Button from "../../ui/Button";
import UserAvatar from "../../user/UserAvatar";
import UserInlineCard from "../../user/UserInlineCard";
import UserProfileOverlay from "../../user/UserProfileOverlay";

export interface PresenceRowAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  /** Return true to hide this action for the given user. */
  hidden?: (u: OnlineUser) => boolean;
  handler: (u: OnlineUser) => void;
}
interface UserRowProps {
  u: OnlineUser;
  dim?: boolean;
  currentUserId?: string | number;
  rowActions: PresenceRowAction[];
}

export const UserRow = memo(({ u, dim, currentUserId, rowActions }: UserRowProps) => {
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
        <Button
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
        </Button>
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

export const ChatBubble = memo(({ msg, currentUserId, isContinuation }: ChatBubbleProps) => {
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

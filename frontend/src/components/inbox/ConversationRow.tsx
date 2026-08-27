import type { InboxConversation } from "../../atoms/inbox";
import { relativeTime } from "../../utils/serverTime";
import Button from "../ui/Button";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";

interface ConversationRowProps {
  conversation: InboxConversation;
  activeId: string | null;
  onSelect: () => void;
}

export function ConversationRow({ conversation, activeId, onSelect }: ConversationRowProps) {
  const other = conversation.other_user;
  const isGroup = conversation.is_group;
  const isActive = conversation.id === activeId;
  const displayName = isGroup
    ? conversation.title || `Group Chat (${conversation.participants?.length || 0})`
    : other?.display_name || other?.username || "Unknown";

  return (
    <Button
      unstyled
      className={`inbox-conv-row${isActive ? " inbox-conv-row--active" : ""}${
        (conversation.unread_count || 0) > 0 ? " inbox-conv-row--unread" : ""
      }`}
      onClick={onSelect}
    >
      <span className="inbox-conv-avatar">
        {isGroup ? (
          <div className="inbox-group-avatar">
            <UserAvatar src={undefined} alt="Group" size={36} initials="G" />
          </div>
        ) : other ? (
          <UserProfileOverlay
            userId={other.id}
            fallbackName={other.display_name || other.username}
            fallbackAvatar={other.avatar_url || undefined}
            disableClick
          >
            <div className="inbox-avatar-fill">
              <UserAvatar
                src={other.avatar_url || undefined}
                alt={other.display_name || other.username}
                size={36}
                initials={(other.display_name || other.username)?.[0]?.toUpperCase()}
              />
            </div>
          </UserProfileOverlay>
        ) : (
          <UserAvatar src={undefined} alt="Unknown" size={36} initials="?" />
        )}
      </span>
      <span className="inbox-conv-info">
        <span className="inbox-conv-name">{displayName}</span>
        {conversation.last_message && (
          <span className="inbox-conv-preview">
            {conversation.last_message.content.slice(0, 50)}
          </span>
        )}
      </span>
      <span className="inbox-conv-meta">
        {conversation.last_message && (
          <span className="inbox-conv-time">
            {relativeTime(conversation.last_message.created_at)}
          </span>
        )}
        {(conversation.unread_count || 0) > 0 && conversation.id !== activeId && (
          <span className="inbox-unread-badge">{conversation.unread_count}</span>
        )}
      </span>
    </Button>
  );
}

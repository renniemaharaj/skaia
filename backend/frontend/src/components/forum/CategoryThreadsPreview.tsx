import { Clock, Edit2, Eye, MessageSquare, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { User } from "../../atoms/auth";
import type { ForumCategory } from "../../atoms/forum";
import { relativeTimeAgo } from "../../utils/serverTime";
import SpotlightCard from "../ui/SpotlightCard";
import UserAvatar from "../user/UserAvatar";
import UserLink from "../user/UserLink";
import UserProfileOverlay from "../user/UserProfileOverlay";
import { ForumPinnedIcon } from "./ForumPinnedIcon";

interface CategoryThreadsPreviewProps {
  forum: ForumCategory;
  currentUser: User | null;
  guestSandboxMode: boolean;
  navigate: NavigateFunction;
  onDeleteThread: (threadId: string, categoryId: string) => void;
  onToggleThreadPin: (threadId: string, pinned: boolean) => void;
}

export function CategoryThreadsPreview({
  forum,
  currentUser,
  guestSandboxMode,
  navigate,
  onDeleteThread,
  onToggleThreadPin,
}: CategoryThreadsPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadsToDisplay = [...(forum.threads || [])].slice(0, 5).reverse();
  const prevCountRef = useRef(threadsToDisplay.length);
  const isAtBottomRef = useRef(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 10;
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    const prev = prevCountRef.current;
    prevCountRef.current = threadsToDisplay.length;
    if (
      threadsToDisplay.length > prev ||
      isAtBottomRef.current ||
      scrollRef.current.scrollTop === 0
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadsToDisplay.length]);

  return (
    <div className="threads-list-scroll" ref={scrollRef} onScroll={handleScroll}>
      {threadsToDisplay.map(thread => {
        const isThreadOwner =
          currentUser != null &&
          thread.user_id != null &&
          String(currentUser.id) === String(thread.user_id);
        const canEditThread =
          isThreadOwner ||
          currentUser?.permissions?.includes("forum.thread-edit") ||
          guestSandboxMode;
        const canDeleteThread =
          isThreadOwner ||
          currentUser?.permissions?.includes("forum.thread-delete") ||
          guestSandboxMode;

        return (
          <SpotlightCard
            key={thread.id}
            className="thread-item"
            style={{
              cursor: "pointer",
              flexShrink: 0,
            }}
            onClick={e => {
              e.stopPropagation();
              navigate(`/view-thread/${thread.id}`);
            }}
          >
            <div className="thread-title-wrapper">
              <div className="thread-title">
                {thread.is_pinned && (
                  <span
                    className="threads-feed-pinned-badge"
                    title="Pinned"
                    style={{ color: "var(--color-primary)" }}
                  >
                    <ForumPinnedIcon style={{ marginRight: "6px", verticalAlign: "text-bottom" }} />
                  </span>
                )}
                {thread.title}
              </div>
              <div className="thread-actions">
                <button
                  type="button"
                  className="action-btn view-btn"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/view-thread/${thread.id}`);
                  }}
                  title="View"
                >
                  <Eye size={14} />
                </button>
                {canEditThread && (
                  <button
                    type="button"
                    className="action-btn edit-btn"
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/edit-thread/${thread.id}`);
                    }}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                {canEditThread && (
                  <button
                    type="button"
                    className={`action-btn pin-btn${thread.is_pinned ? " pinned" : ""}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleThreadPin(thread.id, !thread.is_pinned);
                    }}
                    title={thread.is_pinned ? "Unpin thread" : "Pin thread"}
                    style={thread.is_pinned ? { color: "var(--color-primary)" } : {}}
                  >
                    <ForumPinnedIcon />
                  </button>
                )}
                {canDeleteThread && (
                  <button
                    type="button"
                    className="action-btn danger"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteThread(thread.id, forum.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="thread-meta">
              {thread.user_id && (
                <span
                  className="thread-stat thread-author-stat"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                >
                  <UserProfileOverlay
                    userId={thread.user_id}
                    fallbackName={thread.user_name}
                    fallbackAvatar={thread.user_avatar || undefined}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <UserAvatar
                        src={thread.user_avatar || undefined}
                        alt={thread.user_name || "Unknown"}
                        size={16}
                        initials={thread.user_name?.[0]?.toUpperCase()}
                      />
                      <UserLink
                        userId={String(thread.user_id)}
                        displayName={thread.user_name}
                        variant="subtle"
                      />
                    </div>
                  </UserProfileOverlay>
                </span>
              )}
              <span className="thread-stat">
                <Clock size={14} />
                {relativeTimeAgo(thread.created_at)}
              </span>
              <span className="thread-stat">
                <Eye size={14} />
                {thread.view_count}
              </span>
              <span className="thread-stat">
                <MessageSquare size={14} />
                {thread.reply_count}
              </span>
            </div>
          </SpotlightCard>
        );
      })}
    </div>
  );
}

import {
  UserCog2Icon,
  CalendarIcon,
  MessageCircleIcon,
  ClockIcon,
  TagIcon,
  EyeIcon,
  InfoIcon,
  ThumbsUp,
} from "lucide-react";
import "./ViewThreadMeta.css";
import { truncate } from "lodash";
import { useAtomValue, useSetAtom } from "jotai";
import { currentThreadAtom } from "../atoms/forum";
import { currentUserAtom } from "../atoms/auth";
import { useCallback } from "react";
import { apiRequest } from "../utils/api";

type Author = {
  name: string;
  profilePicture?: string;
  role?: string;
};

type ThreadMeta = {
  threadId?: string;
  createdAt: string;
  replyCount: number;
  lastActivity: string;
  tags: string[];
  views: number;
  status: "Open" | "Closed" | "Archived";
};

type MetaCard = {
  id: string;
  content: React.ReactNode;
};

const ViewThreadMeta = ({ threadId }: { threadId: string | undefined }) => {
  const currentThread = useAtomValue(currentThreadAtom);
  const currentUser = useAtomValue(currentUserAtom);

  const setCurrentThread = useSetAtom(currentThreadAtom);

  const handleLikeThread = useCallback(async () => {
    if (!threadId || !currentThread || !currentUser) return;

    const wasLiked = currentThread.is_liked;
    // Optimistically flip is_liked immediately for the acting user
    setCurrentThread((prev) =>
      prev
        ? {
            ...prev,
            is_liked: !wasLiked,
            likes: wasLiked
              ? Math.max(0, (prev.likes || 0) - 1)
              : (prev.likes || 0) + 1,
          }
        : prev,
    );
    try {
      if (wasLiked) {
        await apiRequest(`/forum/threads/${threadId}/like`, {
          method: "DELETE",
        });
      } else {
        await apiRequest(`/forum/threads/${threadId}/like`, {
          method: "POST",
        });
      }
      // Count will be corrected by WebSocket propagation
    } catch (error) {
      console.error("Error toggling thread like:", error);
      // Revert optimistic update on failure
      setCurrentThread((prev) =>
        prev
          ? {
              ...prev,
              is_liked: wasLiked,
              likes: wasLiked
                ? (prev.likes || 0) + 1
                : Math.max(0, (prev.likes || 0) - 1),
            }
          : prev,
      );
    }
  }, [threadId, currentThread, currentUser, setCurrentThread]);

  const author: Author = {
    name: currentThread?.user_name || "Unknown User",
    profilePicture: currentThread?.user_avatar || "",
    role: currentThread?.user_roles?.join(", ") || "Member",
  };

  const threadMeta: ThreadMeta = {
    threadId,
    createdAt: currentThread?.created_at?.split("T")[0] || "Unknown",
    replyCount: currentThread?.reply_count || 0,
    lastActivity: currentThread?.updated_at?.split("T")[0] || "Unknown",
    tags: ["General"],
    views: currentThread?.view_count || 0,
    status: currentThread?.is_locked ? "Closed" : "Open",
  };

  const metaCards: MetaCard[] = [
    // Author Card
    {
      id: "author",
      content: (
        <div className="user-card">
          {author.profilePicture ? (
            <img
              className="user-card-avatar"
              src={author.profilePicture}
              alt={author.name}
            />
          ) : (
            <UserCog2Icon className="user-card-avatar" />
          )}

          <div className="user-card-info">
            <div className="user-card-name">{author.name}</div>
            {author.role && <div className="user-card-role">{author.role}</div>}
          </div>
        </div>
      ),
    },

    // Created Date
    {
      id: "created",
      content: (
        <div className="meta-row">
          <CalendarIcon size={16} />
          <span>Created: {threadMeta.createdAt}</span>
        </div>
      ),
    },

    // Reply Count
    {
      id: "replies",
      content: (
        <div className="meta-row">
          <MessageCircleIcon size={16} />
          <span>{threadMeta.replyCount} Replies</span>
        </div>
      ),
    },

    // Last Activity
    {
      id: "last-activity",
      content: (
        <div className="meta-row">
          <ClockIcon size={16} />
          <span>Last Activity: {threadMeta.lastActivity}</span>
        </div>
      ),
    },

    // Tags
    {
      id: "tags",
      content: (
        <div className="meta-row meta-tags">
          <TagIcon size={16} />
          <div className="tag-list">
            {threadMeta.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ),
    },

    // Views
    {
      id: "views",
      content: (
        <div className="meta-row">
          <EyeIcon size={16} />
          <span>{threadMeta.views} Views</span>
        </div>
      ),
    },

    // Status
    {
      id: "status",
      content: (
        <div className="meta-row">
          <InfoIcon size={16} />
          <span
            className={`status-badge status-${threadMeta.status.toLowerCase()}`}
          >
            {threadMeta.status}
          </span>
        </div>
      ),
    },

    // Thread ID
    {
      id: "thread-id",
      content: (
        <div className="thread-meta-id">
          Thread ID: {truncate(threadMeta.threadId, { length: 10 })}
        </div>
      ),
    },

    // Likes - show for any authenticated user
    ...(currentUser
      ? [
          {
            id: "likes",
            content: (
              <div className="meta-row">
                <button
                  className="thread-action-btn like-btn"
                  onClick={handleLikeThread}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: currentThread?.is_liked
                      ? "var(--primary-color)"
                      : "inherit",
                  }}
                >
                  <ThumbsUp
                    size={16}
                    fill={currentThread?.is_liked ? "currentColor" : "none"}
                  />
                  <span>
                    {currentThread?.likes && currentThread.likes > 0
                      ? `${currentThread.likes} ${currentThread.likes === 1 ? "Like" : "Likes"}`
                      : "Like"}
                  </span>
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="view-thread-meta-container">
      {metaCards.map((card) => (
        <div key={card.id} className="richtext-outline-1 view-thread-meta-card">
          {card.content}
        </div>
      ))}
    </div>
  );
};

export default ViewThreadMeta;

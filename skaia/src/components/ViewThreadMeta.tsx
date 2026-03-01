import {
  UserCog2Icon,
  CalendarIcon,
  MessageCircleIcon,
  ClockIcon,
  TagIcon,
  EyeIcon,
  InfoIcon,
} from "lucide-react";
import "./ViewThreadMeta.css";
import { truncate } from "lodash";
import { useAtomValue } from "jotai";
import { currentThreadAtom } from "../atoms/forum";

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

  const author: Author = {
    name: currentThread?.user_name || "Unknown User",
    profilePicture: "",
    role: "Member",
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

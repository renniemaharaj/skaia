import {
  CalendarIcon,
  MessageCircleIcon,
  ClockIcon,
  EyeIcon,
  FileText,
} from "lucide-react";
import "./ViewThreadMeta.css";
import { truncate } from "lodash";
import { useAtomValue } from "jotai";
import { currentThreadAtom } from "../../atoms/forum";
import UserLink from "../user/UserLink";

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
  views: number;
  status: "Open" | "Closed" | "Archived";
};

const ViewThreadMeta = ({ threadId }: { threadId: string | undefined }) => {
  const currentThread = useAtomValue(currentThreadAtom);

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
    views: currentThread?.view_count || 0,
    status: currentThread?.is_locked ? "Closed" : "Open",
  };

  const description = truncate(
    (currentThread?.content || "").replace(/[#*_>~`\[\]]/g, " "),
    { length: 180 },
  );

  const statusClass = `vtm-status vtm-status--${threadMeta.status.toLowerCase()}`;

  const metrics = [
    {
      id: "replies",
      icon: MessageCircleIcon,
      label: `${threadMeta.replyCount} Replies`,
    },
    {
      id: "views",
      icon: EyeIcon,
      label: `${threadMeta.views} Views`,
    },
    {
      id: "created",
      icon: CalendarIcon,
      label: `Created ${threadMeta.createdAt}`,
    },
    {
      id: "activity",
      icon: ClockIcon,
      label: `Updated ${threadMeta.lastActivity}`,
    },
  ];

  return (
    <div className="card vtm-panel">
      <div className="vtm-header">
        <div className="vtm-icon">
          <FileText size={24} />
        </div>
        <div className="vtm-info">
          <div className="vtm-label">Thread Viewer</div>
          <h1 className="vtm-title">
            {currentThread?.title || "Untitled Thread"}
          </h1>
          <p className="vtm-description">
            {description || "No description available."}
          </p>
          <div className="vtm-meta-row">
            <div className="vtm-group">
              <span className="vtm-info-label">Author</span>
              <UserLink
                userId={currentThread?.user_id || ""}
                displayName={author.name}
                className="vtm-author-link"
              />
            </div>
            <div className="vtm-group">
              <span className={statusClass}>{threadMeta.status}</span>
              <span className="vtm-id">
                ID: {truncate(threadMeta.threadId, { length: 10 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="vtm-metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.id} className="vtm-chip">
              <Icon size={14} />
              <span>{metric.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ViewThreadMeta;

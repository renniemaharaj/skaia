import { Link } from "react-router-dom";
import { ChevronDown, Eye, Heart, MessageSquare } from "lucide-react";
import type { ForumThread } from "./types";
import { formatDate } from "./useUserData";

interface Props {
  displayName: string;
  threads: ForumThread[];
  threadsLoading: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

const UserThreadsFeed = ({
  displayName,
  threads,
  threadsLoading,
  sentinelRef,
}: Props) => {
  return (
    <div className="up-threads-section">
      <h2 className="up-section-heading">
        <MessageSquare size={18} />
        Threads by {displayName}
      </h2>

      <div className="up-threads-list">
        {threads.map((t) => (
          <Link
            key={t.id}
            to={`/view-thread/${t.id}`}
            className="up-thread-card"
          >
            <div className="up-thread-title">{t.title}</div>
            <p className="up-thread-excerpt">
              {t.content.replace(/<[^>]*>/g, "").slice(0, 130)}
              {t.content.length > 130 ? "…" : ""}
            </p>
            <div className="up-thread-meta">
              <span>
                <Eye size={13} />
                {t.view_count}
              </span>
              <span>
                <MessageSquare size={13} />
                {t.reply_count}
              </span>
              <span>
                <Heart size={13} />
                {t.likes}
              </span>
              <span className="up-thread-date">{formatDate(t.created_at)}</span>
            </div>
          </Link>
        ))}
        {threads.length === 0 && !threadsLoading && (
          <p className="up-empty-hint">No threads posted yet.</p>
        )}
      </div>

      <div ref={sentinelRef} className="up-sentinel">
        {threadsLoading && (
          <span className="up-threads-loading">
            <ChevronDown size={18} />
            Loading…
          </span>
        )}
      </div>
    </div>
  );
};

export default UserThreadsFeed;

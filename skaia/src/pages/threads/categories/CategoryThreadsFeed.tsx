import { Link } from "react-router-dom";
import { ChevronDown, Eye, Heart, MessageSquare } from "lucide-react";
import type { ForumThread } from "../../users/types";
import { formatDate } from "../../users/useUserData";
import UserLink from "../../../components/UserLink";

interface Props {
  threads: ForumThread[];
  loading: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

const CategoryThreadsFeed = ({ threads, loading, sentinelRef }: Props) => {
  return (
    <div className="up-threads-list">
      {threads.map((t) => (
        <Link key={t.id} to={`/view-thread/${t.id}`} className="up-thread-card">
          <div className="up-thread-title">{t.title}</div>
          <p className="up-thread-excerpt">
            {t.content.replace(/<[^>]*>/g, "").slice(0, 130)}
            {t.content.length > 130 ? "…" : ""}
          </p>
          <div className="up-thread-meta">
            {t.user_id && (
              <span
                className="up-thread-author"
                onClick={(e) => e.preventDefault()}
              >
                <UserLink
                  userId={String(t.user_id)}
                  displayName={t.user_name}
                  variant="subtle"
                />
              </span>
            )}
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

      {threads.length === 0 && !loading && (
        <p className="up-empty-hint">No threads in this category yet.</p>
      )}

      <div ref={sentinelRef} className="up-sentinel">
        {loading && (
          <span className="up-threads-loading">
            <ChevronDown size={18} />
            Loading…
          </span>
        )}
      </div>
    </div>
  );
};

export default CategoryThreadsFeed;

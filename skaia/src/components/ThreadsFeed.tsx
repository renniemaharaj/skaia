import "./ThreadsFeed.css";
import { Link } from "react-router-dom";
import { ChevronUp, Eye, Heart, MessageSquare } from "lucide-react";
import type { FeedThread } from "../hooks/useThreadsFeed";
import UserLink from "./UserLink";

function formatDate(s: string): string {
  const d = new Date(s);
  return (
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " · " +
    d.toLocaleDateString([], { month: "short", day: "numeric" })
  );
}

interface Props {
  threads: FeedThread[];
  /** True while the initial page is fetching */
  isLoading: boolean;
  /** True while older items are being fetched (top sentinel) */
  loading: boolean;
  feedRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  /** Show the author link on each card. Defaults to true. */
  showAuthor?: boolean;
  /** Message shown when the list is empty. */
  emptyMessage?: string;
}

const ThreadsFeed = ({
  threads,
  isLoading,
  loading,
  feedRef,
  sentinelRef,
  handleScroll,
  showAuthor = true,
  emptyMessage = "No threads yet.",
}: Props) => {
  return (
    <div className="threads-feed" ref={feedRef} onScroll={handleScroll}>
      {/* Top sentinel — fires IntersectionObserver to load older items */}
      <div ref={sentinelRef} className="threads-feed-sentinel-top">
        {loading && (
          <span className="threads-feed-loading">
            <ChevronUp size={16} />
            Loading older…
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="threads-feed-empty">Loading threads…</div>
      ) : threads.length === 0 ? (
        <div className="threads-feed-empty">{emptyMessage}</div>
      ) : (
        threads.map((t) => (
          <Link
            key={t.id}
            to={`/view-thread/${t.id}`}
            className="threads-feed-card"
          >
            <div className="threads-feed-title">{t.title}</div>
            <p className="threads-feed-excerpt">
              {t.content.replace(/<[^>]*>/g, "").slice(0, 130)}
              {t.content.length > 130 ? "…" : ""}
            </p>
            <div className="threads-feed-meta">
              {showAuthor && t.user_id && (
                <span
                  className="threads-feed-author"
                  onClick={(e) => e.preventDefault()}
                >
                  <UserLink
                    userId={String(t.user_id)}
                    displayName={t.user_name ?? ""}
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
                {t.likes ?? 0}
              </span>
              <span className="threads-feed-date">
                {formatDate(t.created_at)}
              </span>
            </div>
          </Link>
        ))
      )}
    </div>
  );
};

export default ThreadsFeed;

import "./ThreadsFeed.css";
import { Link } from "react-router-dom";
import { ChevronUp, Eye, Heart, MessageSquare, Share2 } from "lucide-react";
import type { FeedThread } from "../../hooks/useThreadsFeed";
import UserLink from "../user/UserLink";
import UserProfileOverlay from "../user/UserProfileOverlay";
import UserAvatar from "../user/UserAvatar";
import { TableView } from "../ui/TableView/TableView";
import { formatDate } from "../../utils/serverTime";

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
      {/* Top sentinel - fires IntersectionObserver to load older items */}
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
        <TableView
          data={threads}
          chrome="embedded"
          rowKey={(t) => t.id}
          columns={[
            {
              header: "Thread",
              width: "minmax(300px, 4fr)",
              className: "table-view__cell--bold",
              cell: (t) => (
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {t.is_pinned && (
                      <span className="threads-feed-pinned-badge" title="Pinned">
                        <svg className="threads-feed-pinned-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                      </span>
                    )}
                    {t.is_shared && (
                      <span className="threads-feed-reshared-badge" title="Reshared">
                        <Share2 size={12} />
                      </span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 'normal' }}>
                    {t.content.replace(/<[^>]*>/g, "").slice(0, 130)}
                    {t.content.length > 130 ? "…" : ""}
                  </div>
                </div>
              )
            },
            ...(showAuthor ? [{
              header: "Author",
              width: "minmax(150px, 1.5fr)",
              cell: (t: FeedThread) => (
                <div onClick={(e) => e.preventDefault()} style={{ display: "flex", alignItems: "center" }}>
                  <UserProfileOverlay
                    userId={String(t.user_id)}
                    fallbackName={t.user_name ?? "Unknown"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                      <UserAvatar
                        src={t.user_avatar || undefined}
                        alt={t.user_name || "Unknown"}
                        size={16}
                        initials={t.user_name?.[0]?.toUpperCase()}
                      />
                      <UserLink
                        userId={String(t.user_id)}
                        displayName={t.user_name ?? ""}
                        variant="subtle"
                      />
                    </div>
                  </UserProfileOverlay>
                </div>
              )
            }] : []),
            {
              header: "Stats",
              width: "minmax(180px, 2fr)",
              className: "table-view__cell--muted",
              cell: (t) => (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={13} /> {t.view_count}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MessageSquare size={13} /> {t.reply_count}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Heart size={13} /> {t.likes ?? 0}</span>
                </div>
              )
            },
            {
              header: "Date",
              width: "minmax(120px, 1fr)",
              className: "table-view__cell--muted",
              cell: (t) => formatDate(t.created_at)
            }
          ]}
          renderRowWrapper={(t, _, props, cells) => (
            <Link
              key={t.id}
              to={`/view-thread/${t.id}`}
              {...props}
            >
              {cells}
            </Link>
          )}
        />
      )}
    </div>
  );
};

export default ThreadsFeed;

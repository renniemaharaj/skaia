import { Clock } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ForumThread } from "../../atoms/forum";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";

import "./RecentThreadsTile.css";

interface RecentThreadsTileProps {
  currentCategoryId?: string | number;
  currentThreadId?: string | number;
}

const RecentThreadsTile: React.FC<RecentThreadsTileProps> = ({
  currentCategoryId,
  currentThreadId,
}) => {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        setLoading(true);
        // If category is provided, maybe we fetch by category? But there's no endpoint for just "recent everywhere" except /forum/threads
        const url = currentCategoryId
          ? `/forum/categories/${currentCategoryId}/threads?limit=6`
          : "/forum/threads?limit=6";

        const data = await apiRequest<ForumThread[]>(url);
        if (data) {
          // filter out current thread
					const filtered = data.filter(
						(t) => t.id.toString() !== currentThreadId?.toString(),
					);
          // only take top 5
          setThreads(filtered.slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to fetch recent threads", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecent();
  }, [currentCategoryId, currentThreadId]);

  if (loading || threads.length === 0) return null;

  return (
		<ContentFlatCard className="toc-tile recent-threads-tile">
      <div className="toc-header">
        <Clock size={16} />
        <h3>Recent Threads</h3>
      </div>
      <div className="toc-content">
				{threads.map((thread) => (
          <Link
            key={thread.id}
            to={`/view-thread/${thread.id}`}
            className="toc-item recent-threads-item"
          >
            <span className="toc-dot recent-threads-dot" />
            <div className="recent-threads-content">
              <span className="recent-threads-title">{thread.title}</span>
              <div className="recent-threads-meta">
                <UserProfileOverlay
                  userId={thread.user_id}
                  fallbackName={thread.user_name}
                  fallbackAvatar={thread.user_avatar}
                >
                  <UserAvatar
                    src={thread.user_avatar}
                    alt={thread.user_name || "Unknown"}
                    size={20}
                  />
                </UserProfileOverlay>
								<span className="recent-threads-author">
									By {thread.user_name || "Unknown"}
								</span>
								<span className="recent-threads-time">
									{relativeTimeAgo(thread.created_at)}
								</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
		</ContentFlatCard>
  );
};

export default RecentThreadsTile;

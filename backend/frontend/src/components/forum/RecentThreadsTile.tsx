import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/api";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import type { ForumThread } from "../../atoms/forum";

interface RecentThreadsTileProps {
  currentCategoryId?: string | number;
  currentThreadId?: string | number;
}

const RecentThreadsTile: React.FC<RecentThreadsTileProps> = ({ currentCategoryId, currentThreadId }) => {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        setLoading(true);
        // If category is provided, maybe we fetch by category? But there's no endpoint for just "recent everywhere" except /forum/threads
        const url = currentCategoryId 
          ? `/forum/categories/${currentCategoryId}/threads?limit=6` 
          : `/forum/threads?limit=6`;
        
        const data = await apiRequest<ForumThread[]>(url);
        if (data) {
          // filter out current thread
          const filtered = data.filter(t => t.id.toString() !== currentThreadId?.toString());
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
    <div className="card toc-tile" style={{ marginTop: '1rem' }}>
      <div className="toc-header">
        <Clock size={16} />
        <h3>Recent Threads</h3>
      </div>
      <div className="toc-content">
        {threads.map(thread => (
          <Link 
            key={thread.id} 
            to={`/view-thread/${thread.id}`}
            className="toc-item"
            style={{ textDecoration: 'none', alignItems: 'flex-start' }}
          >
            <span className="toc-dot" style={{ marginTop: '6px' }}></span>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {thread.title}
              </span>
              <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                By {thread.user_name || "Unknown"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RecentThreadsTile;

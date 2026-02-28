import { useState, useEffect } from "react";
import { Eye, MessageSquare, Plus, Edit2, Trash2 } from "lucide-react";
import { SkeletonCard } from "./SkeletonCard";
import "./Forum.css";
import "./FeatureCard.css";
import "./NewThread.css";
import "./FormGroup.css";
import "./ThreadActions.css";
import { useNavigate } from "react-router-dom";
// import { Navigate, useNavigate } from "react-router-dom";

interface ForumThread {
  id: string;
  title: string;
  views: number;
  replies: number;
  content?: string;
}

interface ForumCategory {
  id: string;
  name: string;
  description: string;
  threads: ForumThread[];
}

interface ForumProps {
  onThreadCreate?: (thread: { title: string; content: string }) => void;
  onThreadDelete?: (id: string) => void;
  onThreadUpdate?: (
    id: string,
    thread: { title: string; content: string },
  ) => void;
}

const MOCK_FORUMS: ForumCategory[] = [
  {
    id: "1",
    name: "General Discussion",
    description: "Talk about anything related to our server",
    threads: [
      { id: "1", title: "Welcome to the forum!", views: 234, replies: 12 },
      {
        id: "2",
        title: "Server updates and news",
        views: 189,
        replies: 8,
      },
    ],
  },
  {
    id: "2",
    name: "Support",
    description: "Get help with server issues",
    threads: [
      {
        id: "3",
        title: "How to get started?",
        views: 456,
        replies: 23,
      },
      {
        id: "4",
        title: "Account recovery help",
        views: 78,
        replies: 5,
      },
    ],
  },
  {
    id: "3",
    name: "Events & Competitions",
    description: "Participate in community events",
    threads: [
      {
        id: "5",
        title: "Monthly PvP tournament",
        views: 567,
        replies: 34,
      },
      {
        id: "6",
        title: "Building contest results",
        views: 234,
        replies: 15,
      },
    ],
  },
];

export const Forum: React.FC<ForumProps> = ({
  // onThreadCreate,
  onThreadDelete,
}) => {
  // const [threadTitle, setThreadTitle] = useState("");
  // const [threadContent, setThreadContent] = useState("");
  const [forumsLoading, setForumsLoading] = useState(true);
  const [forums, setForums] = useState<ForumCategory[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate 5-second load delay for testing skeleton cards
    // const timer = setTimeout(() => {
    setForums(MOCK_FORUMS);
    setForumsLoading(false);
    // }, 300);
    // return () => clearTimeout(timer);
  }, []);

  const handleDeleteThread = (threadId: string) => {
    if (confirm("Are you sure you want to delete this thread?")) {
      onThreadDelete?.(threadId);

      setForums((prev) => {
        return prev.map((forum) => ({
          ...forum,
          threads: forum.threads.filter((t) => t.id !== threadId),
        }));
      });
    }
  };

  return (
    <div className="forum-container">
      <div className="forums-grid">
        {/* New Thread Card */}
        <div
          className="new-thread-card feature-card"
          onClick={() => navigate("/new-thread")}
        >
          <div className="new-thread-content">
            <div className="feature-icon">
              <Plus size={48} className="new-thread-icon" />
            </div>
            <h3>Start a Discussion</h3>
            <p>Share your thoughts with the community</p>
          </div>
        </div>

        {/* Forum Categories */}
        {forumsLoading ? (
          <SkeletonCard count={3} />
        ) : (
          forums.map((forum) => (
            <div key={forum.id} className="forum-category-card">
              <div className="forum-category-header">
                <h3 className="forum-category-title">{forum.name}</h3>
                <span className="forum-threads-count">
                  {forum.threads.length}
                </span>
              </div>
              <p className="forum-category-description">{forum.description}</p>

              {forum.threads.length > 0 ? (
                <div className="threads-list">
                  {forum.threads.slice(0, 3).map((thread) => (
                    <div key={thread.id} className="thread-item">
                      <div className="thread-title-wrapper">
                        <div className="thread-title">{thread.title}</div>
                        <div className="thread-actions">
                          <button
                            className="thread-action-btn view-btn"
                            onClick={() =>
                              navigate(`/view-thread/${thread.id}`)
                            }
                            title="View"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="thread-action-btn edit-btn"
                            onClick={() =>
                              navigate(`/edit-thread/${thread.id}`)
                            }
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="thread-action-btn delete-btn"
                            onClick={() => handleDeleteThread(thread.id)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="thread-meta">
                        <span className="thread-stat">
                          <Eye size={14} />
                          {thread.views} views
                        </span>
                        <span className="thread-stat">
                          <MessageSquare size={14} />
                          {thread.replies} replies
                        </span>
                      </div>
                    </div>
                  ))}
                  {forum.threads.length > 3 && (
                    <div className="empty-threads">
                      +{forum.threads.length - 3} more threads
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-threads">No threads yet</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

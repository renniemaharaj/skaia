import { useState, useEffect } from "react";
import {
  MessageCircle,
  Eye,
  MessageSquare,
  Plus,
  X,
  Edit2,
  Trash2,
} from "lucide-react";
import { SkeletonCard } from "./SkeletonCard";
import "./Forum.css";

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
  onThreadCreate,
  onThreadDelete,
  onThreadUpdate,
}) => {
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState("");
  const [forumsLoading, setForumsLoading] = useState(true);
  const [forums, setForums] = useState<ForumCategory[]>([]);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    // Simulate 5-second load delay for testing skeleton cards
    const timer = setTimeout(() => {
      setForums(MOCK_FORUMS);
      setForumsLoading(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleCreateThread = () => {
    if (threadTitle.trim() && threadContent.trim()) {
      // Call parent callback
      onThreadCreate?.({ title: threadTitle, content: threadContent });

      // Update local state
      const newThread: ForumThread = {
        id: Date.now().toString(),
        title: threadTitle,
        views: 0,
        replies: 0,
        content: threadContent,
      };

      setForums((prev) => {
        const updated = [...prev];
        if (updated[0]) {
          updated[0].threads.unshift(newThread);
        }
        return updated;
      });

      setThreadTitle("");
      setThreadContent("");
      setShowNewThreadModal(false);
    }
  };

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

  const handleEditThread = (thread: ForumThread) => {
    setEditingThreadId(thread.id);
    setEditTitle(thread.title);
    setEditContent(thread.content || "");
  };

  const handleSaveEdit = () => {
    if (editTitle.trim() && editContent.trim() && editingThreadId) {
      onThreadUpdate?.(editingThreadId, {
        title: editTitle,
        content: editContent,
      });

      setForums((prev) => {
        return prev.map((forum) => ({
          ...forum,
          threads: forum.threads.map((t) =>
            t.id === editingThreadId
              ? { ...t, title: editTitle, content: editContent }
              : t,
          ),
        }));
      });

      setEditingThreadId(null);
      setEditTitle("");
      setEditContent("");
    }
  };

  return (
    <div className="forum-container">
      <div className="forum-header">
        <h1>Forum</h1>
        <p>
          Join the Cueballcraft Skaiacraft community and discuss with other
          players
        </p>
      </div>

      <div className="forums-grid">
        {/* New Thread Card */}
        <div
          className="new-thread-card"
          onClick={() => setShowNewThreadModal(true)}
        >
          <div className="new-thread-content">
            <Plus size={48} className="new-thread-icon" />
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
                            className="thread-action-btn edit-btn"
                            onClick={() => handleEditThread(thread)}
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

      {/* New Thread Modal */}
      <div
        className={`modal-overlay ${showNewThreadModal ? "active" : ""}`}
        onClick={() => setShowNewThreadModal(false)}
      >
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title-wrapper">
              <h2>Create New Thread</h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
                Start a discussion with the community
              </p>
            </div>
            <button
              className="modal-close"
              onClick={() => setShowNewThreadModal(false)}
              title="Close"
            >
              <X size={24} />
            </button>
          </div>

          <div className="modal-form">
            <div className="form-group">
              <label htmlFor="title">Thread Title</label>
              <input
                id="title"
                type="text"
                placeholder="What's on your mind?"
                value={threadTitle}
                onChange={(e) => setThreadTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="content">Message</label>
              <textarea
                id="content"
                placeholder="Write your message here..."
                value={threadContent}
                onChange={(e) => setThreadContent(e.target.value)}
              ></textarea>
            </div>

            <div className="form-group">
              <button
                className="btn btn-primary"
                onClick={handleCreateThread}
                disabled={!threadTitle.trim() || !threadContent.trim()}
                style={{ width: "100%" }}
              >
                <MessageCircle size={20} />
                Post Thread
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Thread Modal */}
      <div
        className={`modal-overlay ${editingThreadId ? "active" : ""}`}
        onClick={() => setEditingThreadId(null)}
      >
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title-wrapper">
              <h2>Edit Thread</h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
                Update your discussion
              </p>
            </div>
            <button
              className="modal-close"
              onClick={() => setEditingThreadId(null)}
              title="Close"
            >
              <X size={24} />
            </button>
          </div>

          <div className="modal-form">
            <div className="form-group">
              <label htmlFor="edit-title">Thread Title</label>
              <input
                id="edit-title"
                type="text"
                placeholder="Update title..."
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-content">Message</label>
              <textarea
                id="edit-content"
                placeholder="Update your message..."
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              ></textarea>
            </div>

            <div className="form-group">
              <button
                className="btn btn-primary"
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || !editContent.trim()}
                style={{ width: "100%" }}
              >
                <MessageCircle size={20} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

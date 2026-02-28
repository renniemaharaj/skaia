import { CheckIcon, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ForumCategory from "./ForumCategory";
import Editor from "./Editor";
import "./IconButton.css";
import "./ThreadActions.css";
import { apiRequest } from "../utils/api";

interface ThreadData {
  id: string;
  title: string;
  content: string;
  category_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

const EditThread = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadThread = async () => {
      if (!threadId) return;
      try {
        setLoading(true);
        const response = await apiRequest<ThreadData>(`/forum/threads/${threadId}`);
        if (response) {
          setEditTitle(response.title);
          setEditContent(response.content);
          setSelectedCategory(response.category_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
      } finally {
        setLoading(false);
      }
    };
    loadThread();
  }, [threadId]);

  const handleUpdateThread = async () => {
    setError(null);

    if (!editTitle.trim()) {
      setError("Thread title is required");
      return;
    }

    if (!editContent.trim()) {
      setError("Thread content is required");
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/forum/threads/${threadId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          category_id: selectedCategory,
        }),
      });

      // Navigate back to the thread view
      navigate(`/view-thread/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update thread");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="modal">
        <div className="modal-header">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Edit Thread</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Update your discussion
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {/* Close */}
          <button
            className="thread-action-btn btn-close"
            onClick={() => navigate(`/view-thread/${threadId}`)}
            title="Close"
          >
            <X size={20} />
          </button>
          <button
            className="thread-action-btn btn-submit"
            onClick={handleUpdateThread}
            disabled={submitting}
            title="Submit"
          >
            <CheckIcon size={20} />
          </button>
        </div>
      </div>

      <div className="modal-form">
        {error && (
          <div
            style={{
              color: "#ef4444",
              padding: "12px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              borderRadius: "4px",
              fontSize: "14px",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="edit-title">Thread Title *</label>
          <input
            id="edit-title"
            type="text"
            placeholder="Update title..."
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <ForumCategory value={selectedCategory} onChange={setSelectedCategory} />
        </div>

        <div className="form-group">
          <label htmlFor="content">Message *</label>
          <Editor value={editContent} onChange={setEditContent} />
        </div>
      </div>
    </div>
  );
};

export default EditThread;


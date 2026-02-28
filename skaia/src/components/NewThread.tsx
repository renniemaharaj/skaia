import { useState } from "react";
import Editor from "./Editor";
import ForumCategory from "./ForumCategory";
import "./NewThread.css";
import { CheckIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./IconButton.css";
import "./ThreadActions.css";
import { apiRequest } from "../utils/api";

interface CreateThreadResponse {
  id: string;
  title: string;
  category_id: string;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  reply_count: number;
}

const NewThread = () => {
  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateThread = async () => {
    setError(null);
    
    if (!threadTitle.trim()) {
      setError("Thread title is required");
      return;
    }
    
    if (!threadContent.trim()) {
      setError("Thread content is required");
      return;
    }

    if (!selectedCategory) {
      setError("Please select a category");
      return;
    }

    setLoading(true);

    try {
      const response = await apiRequest<CreateThreadResponse>(
        "/forum/threads",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category_id: selectedCategory,
            title: threadTitle,
            content: threadContent,
          }),
        }
      );

      if (response?.id) {
        // Navigate to the created thread
        navigate(`/view-thread/${response.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create thread"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Create New Thread</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Start a discussion with the community
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {/* Close */}
          <button
            className="thread-action-btn btn-close"
            onClick={() => navigate("/forum")}
            title="Close"
          >
            <X size={20} />
          </button>
          <button
            className="thread-action-btn btn-submit"
            onClick={handleCreateThread}
            disabled={loading}
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
          <label htmlFor="title">Thread Title *</label>
          <input
            id="title"
            type="text"
            placeholder="What's on your mind?"
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <ForumCategory value={selectedCategory} onChange={setSelectedCategory} />
        </div>
        
        <div className="form-group">
          <label htmlFor="content">Message *</label>
          <Editor value={threadContent} onChange={setThreadContent} />
        </div>
      </div>
    </div>
  );
};

export default NewThread;


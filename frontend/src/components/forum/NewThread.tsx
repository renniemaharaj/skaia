import { useAtom } from "jotai";
import { lazy, Suspense, useState } from "react";
const Editor = lazy(() => import("./Editor"));
import ForumCategory from "./ForumCategory";
import "./NewThread.css";
import { CheckIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { draftNewThreadAtom } from "../../atoms/forum";
import "./IconButton.css";

import { apiRequest } from "../../utils/api";

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
  const [draft, setDraft] = useAtom(draftNewThreadAtom);

  const threadTitle = draft?.title || "";
  const threadContent = draft?.content || "";
  const selectedCategory = draft?.categoryId || "";

  const setThreadTitle = (title: string) =>
    setDraft(prev => ({ title, content: prev?.content || "", categoryId: prev?.categoryId || "" }));

  const setThreadContent = (content: string) =>
    setDraft(prev => ({ title: prev?.title || "", content, categoryId: prev?.categoryId || "" }));

  const setSelectedCategory = (categoryId: string) =>
    setDraft(prev => ({ title: prev?.title || "", content: prev?.content || "", categoryId }));

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
      const response = await apiRequest<CreateThreadResponse>("/forum/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category_id: selectedCategory,
          title: threadTitle,
          content: threadContent,
        }),
      });

      if (response?.id) {
        // Clear draft on success
        setDraft(null);
        // Navigate to the created thread
        navigate(`/view-thread/${response.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create thread");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal" onClick={e => e.stopPropagation()}>
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
            type="button"
            className="action-btn btn-close"
            onClick={() => navigate("/forum")}
            title="Close"
          >
            <X size={20} />
          </button>
          <button
            type="submit"
            form="new-thread-form"
            className="action-btn btn-submit"
            disabled={loading}
            title="Submit"
          >
            <CheckIcon size={20} />
          </button>
        </div>
      </div>

      <form
        id="new-thread-form"
        className="modal-form compact-form-card"
        onSubmit={event => {
          event.preventDefault();
          void handleCreateThread();
        }}
      >
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
          <label htmlFor="title">Thread title</label>
          <p className="form-help">Use a clear title that summarizes the discussion.</p>
          <input
            id="title"
            type="text"
            placeholder="What's on your mind?"
            value={threadTitle}
            onChange={e => setThreadTitle(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <ForumCategory value={selectedCategory} onChange={setSelectedCategory} />
        </div>

        <div className="form-group">
          <label htmlFor="content">Message</label>
          <p className="form-help">Add the context other members need to respond.</p>
          <Suspense
            fallback={
              <div className="skeleton skeleton-text" style={{ width: "100%", height: 200 }} />
            }
          >
            <Editor value={threadContent} onChange={setThreadContent} />
          </Suspense>
        </div>
      </form>
    </div>
  );
};

export default NewThread;

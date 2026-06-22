import { useAtom } from "jotai";
import { CheckIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "./Editor";
import ForumCategory from "./ForumCategory";
import "./IconButton.css";
import "./NewThread.css";

import { currentThreadAtom, draftEditThreadAtom } from "../../atoms/forum";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

interface ThreadData {
  id: string;
  title: string;
  content: string;
  category_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  reply_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  is_shared: boolean;
  original_thread_id?: string;
  user_name?: string;
}

const EditThread = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const [currentThread, setCurrentThread] = useAtom(currentThreadAtom);
  const [draft, setDraft] = useAtom(draftEditThreadAtom);

  const { subscribe, unsubscribe } = useWebSocketSync();
  const editTitle = draft?.threadId === threadId && draft?.title ? draft.title : "";
  const editContent = draft?.threadId === threadId && draft?.content ? draft.content : "";
  const selectedCategory =
    draft?.threadId === threadId && draft?.categoryId ? draft.categoryId : "";

  const setEditTitle = (title: string) =>
    setDraft(prev => ({
      title,
      content: prev?.content || "",
      categoryId: prev?.categoryId || "",
      threadId: threadId!,
    }));

  const setEditContent = (content: string) =>
    setDraft(prev => ({
      title: prev?.title || "",
      content,
      categoryId: prev?.categoryId || "",
      threadId: threadId!,
    }));

  const setSelectedCategory = (categoryId: string) =>
    setDraft(prev => ({
      title: prev?.title || "",
      content: prev?.content || "",
      categoryId,
      threadId: threadId!,
    }));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadThread = async () => {
      if (!threadId) return;
      try {
        setLoading(true);
        const response = await apiRequest<ThreadData>(`/forum/threads/${threadId}`);
        if (response) {
          setCurrentThread(response);
          // Only overwrite draft if we don't have a draft for this thread
          if (draft?.threadId !== threadId) {
            setEditTitle(response.title);
            setEditContent(response.content);
            setSelectedCategory(String(response.category_id));
          }
          setLastUpdated(response.updated_at);
          // Subscribe to thread updates to detect changes from other users
          subscribe("thread", Number(threadId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
      } finally {
        setLoading(false);
      }
    };

    loadThread();

    return () => {
      if (threadId) {
        unsubscribe("thread", Number(threadId));
      }
    };
  }, [threadId, setCurrentThread, subscribe, unsubscribe]);

  // Silently sync editor fields when the thread is updated via WebSocket
  useEffect(() => {
    if (currentThread && lastUpdated && currentThread.updated_at !== lastUpdated) {
      setEditTitle(currentThread.title);
      setEditContent(currentThread.content);
      setSelectedCategory(String(currentThread.category_id));
      setLastUpdated(currentThread.updated_at);
    }
  }, [currentThread]);

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
      const response = await apiRequest<ThreadData>(`/forum/threads/${threadId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          category_id: String(selectedCategory),
        }),
      });

      // Update the atom with the fresh response from backend
      if (response) {
        setCurrentThread(response);
      }

      // Clear draft on success
      setDraft(null);

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
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Edit Thread</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>Update your discussion</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {/* Close */}
          <button
            className="action-btn btn-close"
            onClick={() => navigate(`/view-thread/${threadId}`)}
            title="Close"
          >
            <X size={20} />
          </button>
          <button
            className="action-btn btn-submit"
            onClick={handleUpdateThread}
            disabled={submitting}
            title="Submit"
          >
            <CheckIcon size={20} />
          </button>
        </div>
      </div>

      <div className="modal-form compact-form-card">
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
            onChange={e => setEditTitle(e.target.value)}
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

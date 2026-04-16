import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Pencil, Trash2, X, ThumbsUp } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";

import ViewThread from "../../components/forum/ViewThread";
import ViewThreadMeta from "../../components/forum/ViewThreadMeta";
import ViewThreadComments from "../../components/forum/ViewThreadComments";
import { currentThreadAtom, threadPermissionsAtom } from "../../atoms/forum";
import { currentUserAtom } from "../../atoms/auth";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

import "./index.css";
import "../../components/forum/IconButton.css";
import "./../../components/store/EmptyState.css";

const ViewThreadPage = () => {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const [currentThread, setCurrentThread] = useAtom(currentThreadAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const { canEdit, canDelete } = useAtomValue(threadPermissionsAtom);
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(
    window.matchMedia("(max-width: 880px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 880px)");
    const handler = () => setIsMobile(media.matches);

    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  // Load thread data
  useEffect(() => {
    const loadThread = async () => {
      if (!threadId) {
        setError("No thread ID provided");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await apiRequest<typeof currentThread>(
          `/forum/threads/${threadId}`,
        );
        if (response) {
          setCurrentThread(response);
          // Subscribe to thread updates
          subscribe("thread", Number(threadId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
        console.error("Error loading thread:", err);
      } finally {
        setLoading(false);
      }
    };

    loadThread();

    return () => {
      // Unsubscribe when leaving the page
      if (threadId) {
        unsubscribe("thread", Number(threadId));
      }
    };
  }, [threadId, setCurrentThread, subscribe, unsubscribe]);

  const handleEdit = () => {
    navigate(`/edit-thread/${threadId}`);
  };

  const handleDelete = async () => {
    try {
      await apiRequest(`/forum/threads/${threadId}`, {
        method: "DELETE",
      });
      navigate("/forum");
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleLikeThread = async () => {
    if (!threadId || !currentThread || !currentUser) return;

    const wasLiked = currentThread.is_liked;
    setCurrentThread((prev) =>
      prev
        ? {
            ...prev,
            is_liked: !wasLiked,
            likes: wasLiked
              ? Math.max(0, (prev.likes || 0) - 1)
              : (prev.likes || 0) + 1,
          }
        : prev,
    );

    try {
      if (wasLiked) {
        await apiRequest(`/forum/threads/${threadId}/like`, {
          method: "DELETE",
        });
      } else {
        await apiRequest(`/forum/threads/${threadId}/like`, {
          method: "POST",
        });
      }
    } catch (error) {
      console.error("Error toggling thread like:", error);
      setCurrentThread((prev) =>
        prev
          ? {
              ...prev,
              is_liked: wasLiked,
              likes: wasLiked
                ? (prev.likes || 0) + 1
                : Math.max(0, (prev.likes || 0) - 1),
            }
          : prev,
      );
    }
  };

  if (loading) {
    return (
      <div className="modal">
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>Loading thread...</p>
        </div>
      </div>
    );
  }

  if (error || !currentThread) {
    return (
      <div className="modal">
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            {error || "Thread not found"}
          </p>
          <button
            onClick={() => navigate("/forum")}
            style={{ marginTop: "1rem" }}
          >
            Back to Forum
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={isMobile ? "mobile-view-thread-page" : "view-thread-wrapper"}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {/* <Hero height="350px" /> */}
        <div
          style={{
            padding: "1rem",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {currentUser && (
              <button
                className={`thread-action-btn like-btn${currentThread?.is_liked ? " liked" : ""}`}
                onClick={handleLikeThread}
                title="Like"
                type="button"
              >
                <ThumbsUp size={14} />
                {currentThread?.likes ? (
                  <span>{currentThread.likes}</span>
                ) : null}
              </button>
            )}

            {/* Edit - derived from live user permissions atom */}
            {canEdit && (
              <button
                className="thread-action-btn edit-btn"
                onClick={handleEdit}
                title="Edit"
              >
                <Pencil size={14} />
              </button>
            )}

            {/* Delete - derived from live user permissions atom */}
            {canDelete && (
              <button
                className="thread-action-btn delete-btn"
                onClick={handleDelete}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Close */}
            <button
              className="thread-action-btn close-btn"
              onClick={() => navigate("/forum")}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="view-thread-page">
          <ViewThreadMeta threadId={threadId} />
          <div>
            <ViewThread content={currentThread.content} />
            <ViewThreadComments threadId={threadId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewThreadPage;

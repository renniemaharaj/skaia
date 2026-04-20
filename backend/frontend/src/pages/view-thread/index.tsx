import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Pencil,
  Trash2,
  X,
  ThumbsUp,
  Lock,
  Unlock,
  Share2,
  BarChart3,
} from "lucide-react";
import { useAtom, useAtomValue } from "jotai";

import ViewThread from "../../components/forum/ViewThread";
import ViewThreadMeta from "../../components/forum/ViewThreadMeta";
import ViewThreadComments from "../../components/forum/ViewThreadComments";
import { currentThreadAtom, threadPermissionsAtom } from "../../atoms/forum";
import { currentUserAtom } from "../../atoms/auth";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";
import ResourceAnalytics from "../../components/analytics/ResourceAnalytics";

import "./index.css";
import "../../components/forum/IconButton.css";
import "./../../components/store/EmptyState.css";

const ViewThreadPage = () => {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const [currentThread, setCurrentThread] = useAtom(currentThreadAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const { canEdit, canDelete, canLock } = useAtomValue(threadPermissionsAtom);
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

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

  const handleLockThread = async () => {
    if (!threadId || !currentThread) return;
    const newLocked = !currentThread.is_locked;
    try {
      await apiRequest(`/forum/threads/${threadId}/lock`, {
        method: "PUT",
        body: JSON.stringify({ is_locked: newLocked }),
      });
      setCurrentThread((prev) =>
        prev ? { ...prev, is_locked: newLocked } : prev,
      );
    } catch (err) {
      console.error("Lock toggle failed", err);
    }
  };

  const handleShareThread = async () => {
    if (!threadId || !currentThread) return;
    try {
      const shared = await apiRequest<{ id: string }>(
        `/forum/threads/${threadId}/share`,
        {
          method: "POST",
          body: JSON.stringify({ content: currentThread.content }),
        },
      );
      if (shared?.id) {
        navigate(`/view-thread/${shared.id}`);
      }
    } catch (err) {
      console.error("Share failed", err);
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

            {/* Share */}
            {currentUser && (
              <button
                className="thread-action-btn share-btn"
                onClick={handleShareThread}
                title="Share thread"
                type="button"
              >
                <Share2 size={14} />
              </button>
            )}

            {/* Lock/Unlock */}
            {canLock && (
              <button
                className={`thread-action-btn lock-btn${currentThread?.is_locked ? " locked" : ""}`}
                onClick={handleLockThread}
                title={
                  currentThread?.is_locked ? "Unlock thread" : "Lock thread"
                }
                type="button"
              >
                {currentThread?.is_locked ? (
                  <Unlock size={14} />
                ) : (
                  <Lock size={14} />
                )}
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

            {/* Analytics */}
            {currentUser && (canEdit || canDelete) && (
              <button
                className="thread-action-btn"
                onClick={() => setShowAnalytics(true)}
                title="Analytics"
                type="button"
              >
                <BarChart3 size={14} />
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
            {currentThread.is_shared && currentThread.original_thread && (
              <div
                className="reshared-banner"
                onClick={() =>
                  navigate(`/view-thread/${currentThread.original_thread_id}`)
                }
              >
                <Share2 size={14} />
                <span>
                  Reshared from{" "}
                  <strong>{currentThread.original_thread.title}</strong> by{" "}
                  {currentThread.original_thread.user_name ?? "unknown"}
                </span>
              </div>
            )}
            <ViewThread content={currentThread.content} />
            <ViewThreadComments threadId={threadId} />
          </div>
        </div>
      </div>

      {showAnalytics && currentThread && (
        <ResourceAnalytics
          resource="thread"
          resourceId={Number(currentThread.id)}
          title={currentThread.title}
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  );
};

export default ViewThreadPage;

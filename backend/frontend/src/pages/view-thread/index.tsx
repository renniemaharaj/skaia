import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Pencil,
  Trash2,
  X,
  ThumbsUp,
  Unlock,
  Share2,
  BarChart3,
  BookOpen,
  Lock,
} from "lucide-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import ViewThread from "../../components/forum/ViewThread";
import ViewThreadMeta from "../../components/forum/ViewThreadMeta";
import ViewThreadComments from "../../components/forum/ViewThreadComments";
import { currentThreadAtom, threadPermissionsAtom } from "../../atoms/forum";
import { currentUserAtom } from "../../atoms/auth";
import { contextUserAtom } from "../../atoms/contextUser";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";
import ResourceAnalytics from "../../components/analytics/ResourceAnalytics";
import TableOfContentsTile from "../../components/forum/TableOfContentsTile";
import RecentThreadsTile from "../../components/forum/RecentThreadsTile";
import { ThreadUserTiles } from "../../components/forum/ThreadUserTiles";
import ThreadMediaViewer from "../../components/forum/ThreadMediaViewer";
import VoicePanel from "../page/layout/VoicePanel";
import type { Role } from "../users/types";

import "./index.css";
import "../../components/forum/IconButton.css";

const ViewThreadPage = () => {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const [currentThread, setCurrentThread] = useAtom(currentThreadAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const setContextUser = useSetAtom(contextUserAtom);
  
  useEffect(() => {
    if (currentThread) {
      setContextUser({
        background_video_url: currentThread.user_background_video_url,
        background_image_url: currentThread.user_background_image_url,
        background_position: currentThread.user_background_position,
      });
    }
    return () => setContextUser(null);
  }, [currentThread, setContextUser]);

  const { canEdit, canDelete, canLock } = useAtomValue(threadPermissionsAtom);
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [authorColor, setAuthorColor] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState(false);

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

  // Load author role color for background
  useEffect(() => {
    if (!currentThread?.user_id || !currentThread?.user_roles) return;
    const fetchColor = async () => {
      try {
        const roles = await apiRequest<Role[]>("/users/roles");
        if (roles) {
          const userRoles = currentThread.user_roles || [];
          const matchedRoles = roles.filter(r => userRoles.includes(r.name)).sort((a, b) => b.power_level - a.power_level);
          if (matchedRoles.length > 0 && matchedRoles[0].theme_color) {
            setAuthorColor(matchedRoles[0].theme_color);
          }
        }
      } catch (err) {
        console.error("Failed to load roles for thread color", err);
      }
    };
    fetchColor();
  }, [currentThread?.user_id, currentThread?.user_roles]);

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
      <div className="card view-thread-state-card">
        <p>Loading thread...</p>
      </div>
    );
  }

  if (error || !currentThread) {
    return (
      <div className="card view-thread-state-card">
        <p className="view-thread-state-text">
          {error || "Thread not found"}
        </p>
        <button
          onClick={() => navigate("/forum")}
          className="btn btn-primary view-thread-state-btn"
        >
          Back to Forum
        </button>
      </div>
    );
  }

  return (
    <div
      className={isMobile ? "mobile-view-thread-page" : "view-thread-wrapper"}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="view-thread-container">
        {/* <Hero height="350px" /> */}
        {/* Body */}
        <div style={{ width: '100%', marginBottom: '1.5rem' }}>
          <ViewThreadMeta 
            threadId={threadId} 
            actions={
              <div className="view-thread-actions-group">
                {currentUser && (
                  <button
                    className={`action-btn like-btn${currentThread?.is_liked ? " liked" : ""}`}
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

                {/* Reading Mode */}
                <button
                  className={`action-btn ${readingMode ? 'active' : ''}`}
                  onClick={() => setReadingMode(!readingMode)}
                  title={readingMode ? "Disable Reading Mode" : "Enable Reading Mode"}
                >
                  <BookOpen size={16} />
                </button>

                {/* Share */}
                {currentUser && (
                  <button
                    className="action-btn share-btn"
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
                    className={`action-btn lock-btn${currentThread?.is_locked ? " locked" : ""}`}
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
                    className="action-btn edit-btn"
                    onClick={handleEdit}
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                )}

                {/* Delete - derived from live user permissions atom */}
                {canDelete && (
                  <button
                    className="action-btn danger"
                    onClick={handleDelete}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}

                {/* Analytics */}
                {currentUser && (canEdit || canDelete) && (
                  <button
                    className="action-btn"
                    onClick={() => setShowAnalytics(true)}
                    title="Analytics"
                    type="button"
                  >
                    <BarChart3 size={14} />
                  </button>
                )}

                {/* Close */}
                <button
                  className="action-btn close-btn"
                  onClick={() => navigate("/forum")}
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            }
          />
        </div>
        <div className="view-thread-mobile-only">
          <TableOfContentsTile htmlContent={currentThread.content} />
        </div>
        <ThreadMediaViewer />

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

        <div style={{ marginBottom: '1.5rem' }}>
          <ThreadUserTiles threadId={threadId!} type="contributors" />
        </div>

        <div 
          className={`view-thread-page ${readingMode ? 'view-thread-page--reading-mode' : ''}`} 
          style={authorColor ? { 
            background: `linear-gradient(to bottom, ${authorColor}15, transparent)`, 
            borderTop: `2px solid ${authorColor}` 
          } : {}}
        >
          <div className="view-thread-main">
            <div>
              <ViewThread content={currentThread.content} />
              {readingMode && <ViewThreadComments threadId={threadId} />}
            </div>
          </div>
          
          {!readingMode && (
            <aside className="view-thread-sidebar">
              <div className="view-thread-desktop-only">
                <VoicePanel mediaOnly={true} />
              </div>
              <div className="view-thread-desktop-only">
                <TableOfContentsTile htmlContent={currentThread.content} />
              </div>
              <RecentThreadsTile currentCategoryId={currentThread.category_id} currentThreadId={currentThread.id} />
              <ThreadUserTiles threadId={threadId!} type="likers" />
              <ThreadUserTiles threadId={threadId!} type="viewers" />
              <div className="card view-thread-sidebar-comments" style={{ padding: 0, marginTop: '0.5rem', display: 'flex', flexDirection: 'column' }}>
                <ViewThreadComments threadId={threadId} />
              </div>
            </aside>
          )}
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

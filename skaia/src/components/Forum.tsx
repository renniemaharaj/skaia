import { useState, useEffect, useRef } from "react";
import { Eye, MessageSquare, Plus, Edit2, Trash2 } from "lucide-react";
import { useAtomValue } from "jotai";
import { currentUserAtom, isAuthenticatedAtom } from "../atoms/auth";
import { apiRequest } from "../utils/api";
import { SkeletonCard } from "./SkeletonCard";
import { CreateCategoryDialog } from "./CreateCategoryDialog";
import "./Forum.css";
import "./FeatureCard.css";
import "./NewThread.css";
import "./FormGroup.css";
import "./ThreadActions.css";
import { useNavigate } from "react-router-dom";

interface ForumThread {
  id: string;
  title: string;
  view_count: number;
  reply_count: number;
  content?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface ForumCategory {
  id: string;
  name: string;
  description: string;
  threads: ForumThread[];
  created_at?: string;
  display_order?: number;
}

interface ForumProps {
  // No longer needed - all forum operations are now API-driven with WebSocket updates
}

export const Forum: React.FC<ForumProps> = () => {
  const [forumsLoading, setForumsLoading] = useState(true);
  const [forums, setForums] = useState<ForumCategory[]>([]);
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] =
    useState(false);

  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const wsRef = useRef<WebSocket | null>(null);

  // Load forums from API
  const loadForums = async () => {
    try {
      setForumsLoading(true);
      const response = await apiRequest<ForumCategory[]>("/forum/categories");
      setForums(response || []);
    } catch (error) {
      console.error("Error loading forums:", error);
      setForums([]);
    } finally {
      setForumsLoading(false);
    }
  };

  // Setup WebSocket subscription
  const setupWebSocket = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("Connected to WebSocket for forum updates");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "forum:update") {
            const payload = message.payload;
            if (payload.action === "category_created") {
              setForums((prev) => [...prev, payload.data]);
            } else if (payload.action === "category_deleted") {
              setForums((prev) => prev.filter((c) => c.id !== payload.id));
            } else if (payload.action === "thread_created") {
              setForums((prev) =>
                prev.map((category) => {
                  if (category.id === payload.data.category_id) {
                    return {
                      ...category,
                      threads: [payload.data, ...category.threads].slice(0, 2),
                    };
                  }
                  return category;
                }),
              );
            } else if (payload.action === "thread_deleted") {
              setForums((prev) =>
                prev.map((category) => ({
                  ...category,
                  threads: (category.threads || []).filter(
                    (t) => t.id !== payload.id,
                  ),
                })),
              );
            } else if (payload.action === "thread_updated") {
              setForums((prev) =>
                prev.map((category) => ({
                  ...category,
                  threads: (category.threads || []).map((t) =>
                    t.id === payload.data.id ? payload.data : t,
                  ),
                })),
              );
            }
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("Disconnected from WebSocket");
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
    }
  };

  // Load forums on mount
  useEffect(() => {
    loadForums();
  }, []);

  // Setup WebSocket on mount
  useEffect(() => {
    setupWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleDeleteCategory = async (categoryId: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      try {
        await apiRequest(`/forum/categories/${categoryId}`, {
          method: "DELETE",
        });
        // Deletion will come through WebSocket
      } catch (error) {
        console.error("Error deleting category:", error);
      }
    }
  };

  const handleDeleteThread = (threadId: string) => {
    if (confirm("Are you sure you want to delete this thread?")) {
      apiRequest(`/forum/threads/${threadId}`, {
        method: "DELETE",
      }).catch((error) => console.error("Error deleting thread:", error));
    }
  };

  const canCreateCategory = currentUser?.permissions?.includes(
    "forums.createCategory",
  );
  const canDeleteCategory = currentUser?.permissions?.includes(
    "forums.deleteCategory",
  );

  // Debug logging
  useEffect(() => {
    console.log("Current user:", currentUser);
    console.log("User permissions:", currentUser?.permissions);
    console.log("Can create category:", canCreateCategory);
  }, [currentUser, canCreateCategory]);

  return (
    <div className="forum-container">
      <div className="forums-grid">
        {/* New Thread & Create Category Card */}
        {isAuthenticated && (
          <div className="new-thread-card feature-card">
            <div className="new-thread-content">
              <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                {/* Start Discussion */}
                <div
                  onClick={() => navigate("/new-thread")}
                  style={{
                    flex: 1,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div className="feature-icon">
                    <Plus size={48} className="new-thread-icon" />
                  </div>
                  <h3>Start a Discussion</h3>
                  <p>Share your thoughts with the community</p>
                </div>
                {/* Create Category */}
                <div
                  onClick={() => setShowCreateCategoryDialog(true)}
                  style={{
                    flex: 1,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div className="feature-icon">
                    <Plus size={48} className="new-thread-icon" />
                  </div>
                  <h3>Create Category</h3>
                  <p>Add a new forum category</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <CreateCategoryDialog
          isOpen={showCreateCategoryDialog}
          onClose={() => setShowCreateCategoryDialog(false)}
        />

        {/* Forum Categories */}
        {forumsLoading ? (
          <SkeletonCard count={3} />
        ) : (
          forums.map((forum) => (
            <div key={forum.id} className="forum-category-card">
              <div className="forum-category-header">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <h3 className="forum-category-title">{forum.name}</h3>
                  {canDeleteCategory && (
                    <button
                      onClick={() => handleDeleteCategory(forum.id)}
                      title="Delete category"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#ef4444",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <span className="forum-threads-count">
                  {(forum.threads || []).length}
                </span>
              </div>
              <p className="forum-category-description">{forum.description}</p>

              {(forum.threads || []).length > 0 ? (
                <div className="threads-list">
                  {(forum.threads || []).slice(0, 2).map((thread) => {
                    const isThreadOwner = currentUser?.id === thread.user_id;
                    const canEditThread =
                      isThreadOwner ||
                      currentUser?.permissions?.includes("forums.editAny") ||
                      currentUser?.roles?.includes("admin");
                    const canDeleteThread =
                      isThreadOwner ||
                      currentUser?.permissions?.includes("forums.deleteAny") ||
                      currentUser?.roles?.includes("admin");

                    return (
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
                            {canEditThread && (
                              <button
                                className="thread-action-btn edit-btn"
                                onClick={() =>
                                  navigate(`/edit-thread/${thread.id}`)
                                }
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {canDeleteThread && (
                              <button
                                className="thread-action-btn delete-btn"
                                onClick={() => handleDeleteThread(thread.id)}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="thread-meta">
                          <span className="thread-stat">
                            <Eye size={14} />
                            {thread.view_count} views
                          </span>
                          <span className="thread-stat">
                            <MessageSquare size={14} />
                            {thread.reply_count} replies
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {forum.threads.length > 2 && (
                    <div className="empty-threads">
                      +{forum.threads.length - 2} more threads
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

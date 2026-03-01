import { useState, useEffect } from "react";
import { Eye, MessageSquare, Plus, Edit2, Trash2 } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { currentUserAtom, isAuthenticatedAtom } from "../atoms/auth";
import { forumCategoriesAtom } from "../atoms/forum";
import { apiRequest } from "../utils/api";
import { SkeletonCard } from "./SkeletonCard";
import { CreateCategoryDialog } from "./CreateCategoryDialog";
import { useWebSocketSync } from "../hooks/useWebSocketSync";
import "./Forum.css";
import "./FeatureCard.css";
import "./NewThread.css";
import "./FormGroup.css";
import "./ThreadActions.css";
import { useNavigate } from "react-router-dom";

interface ForumProps {
  // No longer needed - all forum operations are now API-driven with WebSocket updates
}

export const Forum: React.FC<ForumProps> = () => {
  const [forumsLoading, setForumsLoading] = useState(true);
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] =
    useState(false);

  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const forums = useAtomValue(forumCategoriesAtom);
  const setForumCategories = useSetAtom(forumCategoriesAtom);

  // Setup WebSocket synchronization for forum updates
  const { subscribe } = useWebSocketSync();

  // Load forums from API on mount
  useEffect(() => {
    const loadForums = async () => {
      try {
        setForumsLoading(true);
        const response = await apiRequest("/forum/categories");
        if (response && Array.isArray(response)) {
          // Convert API response to ForumCategory format
          const categories = response.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            description: cat.description || "",
            thread_count: cat.thread_count || 0,
            created_at: cat.created_at,
            updated_at: cat.updated_at,
            threads: cat.threads || [],
          }));
          setForumCategories(categories);

          // Subscribe to each category so we receive propagated updates
          categories.forEach((category) => {
            subscribe("forum_category", category.id);
          });
        }
      } catch (error) {
        console.error("Error loading forums:", error);
      } finally {
        setForumsLoading(false);
      }
    };

    loadForums();
  }, [setForumCategories, subscribe]);

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
                  {(forum.threads || []).length > 2 && (
                    <div className="empty-threads">
                      +{(forum.threads || []).length - 2} more threads
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

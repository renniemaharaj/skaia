import { useState, useEffect, useCallback } from "react";
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
import UserLink from "./UserLink";

interface ForumProps {
  // No longer needed - all forum operations are now API-driven with WebSocket updates
}

export const Forum: React.FC<ForumProps> = () => {
  const [forumsLoading, setForumsLoading] = useState(true);
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] =
    useState(false);
  const [hoveredSection, setHoveredSection] = useState<
    "discussion" | "category" | null
  >(null);

  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const forums = useAtomValue(forumCategoriesAtom);
  const setForumCategories = useSetAtom(forumCategoriesAtom);

  // Setup WebSocket synchronization for forum updates
  const { subscribe } = useWebSocketSync();

  // Load forums from API
  const loadForums = useCallback(async () => {
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
  }, [setForumCategories, subscribe]);

  // Load forums from API on mount
  useEffect(() => {
    loadForums();
  }, [loadForums]);

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

  const handleDeleteThread = (threadId: string, _: string) => {
    if (confirm("Are you sure you want to delete this thread?")) {
      apiRequest(`/forum/threads/${threadId}`, {
        method: "DELETE",
      }).catch((error) => {
        console.error("Error deleting thread:", error);
      });
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
                  onMouseEnter={() => setHoveredSection("discussion")}
                  onMouseLeave={() => setHoveredSection(null)}
                  style={{
                    flex: 1,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    transition: "transform 0.2s ease, color 0.2s ease",
                    transform:
                      hoveredSection === "discussion"
                        ? "scale(1.05)"
                        : "scale(1)",
                    color:
                      hoveredSection === "discussion"
                        ? "var(--primary-color)"
                        : "inherit",
                  }}
                >
                  <div className="feature-icon">
                    <Plus size={48} className="new-thread-icon" />
                  </div>
                  <h3>Start a Discussion</h3>
                  <p>Share your thoughts with the community</p>
                </div>

                {/* Create Category Icon */}
                {canCreateCategory && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCreateCategoryDialog(true);
                    }}
                    onMouseEnter={() => setHoveredSection("category")}
                    onMouseLeave={() => setHoveredSection(null)}
                    style={{
                      flex: 0,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      justifyContent: "center",
                      padding: "0 16px",
                      borderLeft: "1px solid var(--border-color)",
                      transition:
                        "background-color 0.2s ease, opacity 0.2s ease",
                      backgroundColor:
                        hoveredSection === "category"
                          ? "var(--surface-hover-color, rgba(255,255,255,0.05))"
                          : "transparent",
                    }}
                    title="Create Category"
                  >
                    <Plus
                      size={32}
                      className="new-thread-icon"
                      style={{
                        opacity: hoveredSection === "category" ? 1 : 0.6,
                        transition: "opacity 0.2s ease, transform 0.2s ease",
                        transform:
                          hoveredSection === "category"
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.7rem",
                        opacity: hoveredSection === "category" ? 1 : 0.6,
                        transition: "opacity 0.2s ease",
                      }}
                    >
                      New Category
                    </span>
                  </div>
                )}
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
                <h3 className="forum-category-title">{forum.name}</h3>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <span className="forum-threads-count">
                    {(forum.threads || []).filter((t) => !t.is_locked).length}
                  </span>
                  {canDeleteCategory && (
                    <button
                      className="thread-action-btn delete-btn"
                      onClick={() => handleDeleteCategory(forum.id)}
                      title="Delete category"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <p className="forum-category-description">{forum.description}</p>

              {(forum.threads || []).length > 0 ? (
                <div className="threads-list">
                  {(forum.threads || []).slice(0, 2).map((thread) => {
                    const isThreadOwner =
                      currentUser != null &&
                      thread.user_id != null &&
                      String(currentUser.id) === String(thread.user_id);
                    const canEditThread =
                      isThreadOwner ||
                      currentUser?.permissions?.includes("forum.edit-thread");
                    const canDeleteThread =
                      isThreadOwner ||
                      currentUser?.permissions?.includes("forum.delete-thread");

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
                                onClick={() =>
                                  handleDeleteThread(thread.id, forum.id)
                                }
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="thread-meta">
                          {thread.user_id && (
                            <span className="thread-stat thread-author-stat">
                              <UserLink
                                userId={String(thread.user_id)}
                                displayName={thread.user_name}
                                variant="subtle"
                              />
                            </span>
                          )}
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

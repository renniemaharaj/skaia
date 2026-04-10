import { useState, useEffect, useCallback } from "react";
import { Eye, MessageSquare, Plus, Edit2, Trash2 } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { currentUserAtom, isAuthenticatedAtom } from "../../atoms/auth";
import { forumCategoriesAtom } from "../../atoms/forum";
import { apiRequest } from "../../utils/api";
import { CreateCategoryDialog } from "./CreateCategoryDialog";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";

import "./Forum.css";
import "../ui/FeatureCard.css";
import "./NewThread.css";
import "../ui/FormGroup.css";
import "./ThreadActions.css";
import { useNavigate } from "react-router-dom";
import UserLink from "../user/UserLink";

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

  const [guestSandboxMode] = useGuestSandboxMode();

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
    try {
      await apiRequest(`/forum/categories/${categoryId}`, {
        method: "DELETE",
      });
      // Deletion will come through WebSocket
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  const handleDeleteThread = (threadId: string, _: string) => {
    apiRequest(`/forum/threads/${threadId}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error("Error deleting thread:", error);
    });
  };

  const canCreateCategory =
    currentUser?.permissions?.includes("forum.category-new") ||
    guestSandboxMode;
  const canDeleteCategory =
    currentUser?.permissions?.includes("forum.category-delete") ||
    guestSandboxMode;

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
        {(forumsLoading
          ? Array.from({ length: 3 }, (_, i) => ({
              id: `skeleton-${i}`,
              name: "",
              description: "",
              thread_count: 0,
              created_at: "",
              updated_at: "",
              threads: [],
            }))
          : forums
        ).map((forum) => {
          const loading = forumsLoading;

          return (
            <div
              key={forum.id}
              className="forum-category-card"
              onClick={
                loading
                  ? undefined
                  : () => navigate(`/threads/categories/${forum.id}`)
              }
              style={loading ? { cursor: "default" } : undefined}
            >
              {/* Header */}
              <div className="forum-category-header">
                {loading ? (
                  <div
                    className="skeleton"
                    style={{ width: "50%", height: 20, borderRadius: 4 }}
                  />
                ) : (
                  <h3 className="forum-category-title">{forum.name}</h3>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  {loading ? (
                    <div
                      className="skeleton"
                      style={{ width: 40, height: 18, borderRadius: 999 }}
                    />
                  ) : (
                    <>
                      <span className="forum-threads-count">
                        {
                          (forum.threads || []).filter((t) => !t.is_locked)
                            .length
                        }
                      </span>
                      {canDeleteCategory && (
                        <button
                          className="thread-action-btn delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(forum.id);
                          }}
                          title="Delete category"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Description */}
              {loading ? (
                <div
                  className="skeleton"
                  style={{
                    width: "95%",
                    height: 12,
                    borderRadius: 4,
                    marginBottom: 16,
                  }}
                />
              ) : (
                <p className="forum-category-description">
                  {forum.description}
                </p>
              )}

              {/* Threads */}
              {loading ? (
                <div className="threads-list">
                  <div
                    className="skeleton"
                    style={{ width: "100%", flex: 1, borderRadius: 8 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: "100%", flex: 1, borderRadius: 8 }}
                  />
                </div>
              ) : (forum.threads || []).length > 0 ? (
                <div className="threads-list">
                  <div className="threads-list-scroll">
                    {(forum.threads || []).slice(0, 5).map((thread) => {
                      const isThreadOwner =
                        currentUser != null &&
                        thread.user_id != null &&
                        String(currentUser.id) === String(thread.user_id);
                      const canEditThread =
                        isThreadOwner ||
                        currentUser?.permissions?.includes("forum.thread-edit");
                      const canDeleteThread =
                        isThreadOwner ||
                        currentUser?.permissions?.includes(
                          "forum.thread-delete",
                        );

                      return (
                        <div
                          key={thread.id}
                          className="thread-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/view-thread/${thread.id}`);
                          }}
                        >
                          <div className="thread-title-wrapper">
                            <div className="thread-title">{thread.title}</div>
                            <div className="thread-actions">
                              <button
                                className="thread-action-btn view-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/view-thread/${thread.id}`);
                                }}
                                title="View"
                              >
                                <Eye size={14} />
                              </button>
                              {canEditThread && (
                                <button
                                  className="thread-action-btn edit-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/edit-thread/${thread.id}`);
                                  }}
                                  title="Edit"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {canDeleteThread && (
                                <button
                                  className="thread-action-btn delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteThread(thread.id, forum.id);
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="thread-meta">
                            {thread.user_id && (
                              <span
                                className="thread-stat thread-author-stat"
                                onClick={(e) => e.stopPropagation()}
                              >
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
                  </div>
                  <div
                    className="threads-see-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/threads/categories/${forum.id}`);
                    }}
                  >
                    See more in {forum.name} &rarr;
                  </div>
                </div>
              ) : (
                <div className="empty-threads">No threads yet</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

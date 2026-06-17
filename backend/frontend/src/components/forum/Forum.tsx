import { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  Clock,
} from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  currentUserAtom,
  isAuthenticatedAtom,
  socketAtom,
} from "../../atoms/auth";
import { forumCategoriesAtom } from "../../atoms/forum";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";


import "./Forum.css";
import "../ui/FeatureCard.css";
import "./NewThread.css";
import "../ui/FormGroup.css";

import { useNavigate } from "react-router-dom";
import UserLink from "../user/UserLink";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import { relativeTimeAgo } from "../../utils/serverTime";
import SpotlightCard from "../ui/SpotlightCard";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
import CategoryThreadsFeed from "./CategoryThreadsFeed";
import { useThreadsFeed } from "../../hooks/useThreadsFeed";

const CategoryThreadsPreview = ({
  forum,
  currentUser,
  guestSandboxMode,
  navigate,
  handleDeleteThread,
  handleToggleThreadPin,
}: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadsToDisplay = [...(forum.threads || [])].slice(0, 5).reverse();
  const prevCountRef = useRef(threadsToDisplay.length);
  const isAtBottomRef = useRef(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 10;
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    const prev = prevCountRef.current;
    prevCountRef.current = threadsToDisplay.length;
    // Auto scroll to bottom if we are already at the bottom, or if a new thread just came in
    if (threadsToDisplay.length > prev || isAtBottomRef.current || scrollRef.current.scrollTop === 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadsToDisplay.length]);

  return (
    <div className="threads-list-scroll" ref={scrollRef} onScroll={handleScroll}>
      {threadsToDisplay.map((thread) => {
        const isThreadOwner =
          currentUser != null &&
          thread.user_id != null &&
          String(currentUser.id) === String(thread.user_id);
        const canEditThread =
          isThreadOwner ||
          currentUser?.permissions?.includes("forum.thread-edit") ||
          guestSandboxMode;
        const canDeleteThread =
          isThreadOwner ||
          currentUser?.permissions?.includes("forum.thread-delete") ||
          guestSandboxMode;

        return (
          <SpotlightCard
            key={thread.id}
            className="thread-item"
            style={{ padding: '0.75rem', marginBottom: '0.5rem', cursor: 'pointer', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/view-thread/${thread.id}`);
            }}
          >
            <div className="thread-title-wrapper">
              <div className="thread-title">
                {thread.is_pinned && (
                  <span className="threads-feed-pinned-badge" title="Pinned" style={{ color: "var(--color-primary)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                  </span>
                )}
                {thread.title}
              </div>
              <div className="thread-actions">
                <button
                  className="action-btn view-btn"
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
                    className="action-btn edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/edit-thread/${thread.id}`);
                    }}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                {canEditThread && (
                  <button
                    className={`action-btn pin-btn${thread.is_pinned ? " pinned" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleThreadPin(thread.id, !thread.is_pinned);
                    }}
                    title={thread.is_pinned ? "Unpin thread" : "Pin thread"}
                    style={thread.is_pinned ? { color: "var(--color-primary)" } : {}}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                  </button>
                )}
                {canDeleteThread && (
                  <button
                    className="action-btn danger"
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
                  <UserProfileOverlay userId={thread.user_id} fallbackName={thread.user_name} fallbackAvatar={thread.user_avatar || undefined}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <UserAvatar src={thread.user_avatar || undefined} alt={thread.user_name || "Unknown"} size={16} initials={thread.user_name?.[0]?.toUpperCase()} />
                      <UserLink
                        userId={String(thread.user_id)}
                        displayName={thread.user_name}
                        variant="subtle"
                      />
                    </div>
                  </UserProfileOverlay>
                </span>
              )}
              <span className="thread-stat">
                <Clock size={14} />
                {relativeTimeAgo(thread.created_at)}
              </span>
              <span className="thread-stat">
                <Eye size={14} />
                {thread.view_count} views
              </span>
              <span className="thread-stat">
                <MessageSquare size={14} />
                {thread.reply_count} replies
              </span>
            </div>
          </SpotlightCard>
        );
      })}
    </div>
  );
};

export const Forum: React.FC = () => {
  const [forumsLoading, setForumsLoading] = useState(true);
  const [hoveredSection, setHoveredSection] = useState<
    "discussion" | "category" | null
  >(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toggleView = (mode: "grid" | "list") => {
    setViewMode(mode);
  };

  const {
    threads: listThreads,
    isLoading: threadsLoading,
    loading: threadsFetchingOlder,
    feedRef,
    sentinelRef,
    handleScroll,
  } = useThreadsFeed({ searchQuery });

  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const forums = useAtomValue(forumCategoriesAtom);
  const setForumCategories = useSetAtom(forumCategoriesAtom);

  // Setup WebSocket synchronization for forum updates
  const { subscribe } = useWebSocketSync();

  const [guestSandboxMode] = useGuestSandboxMode();

  // Load forums from API
  const loadForums = useCallback(async (query?: string) => {
    try {
      setForumsLoading(true);
      const url = query ? `/forum/categories?q=${encodeURIComponent(query)}` : "/forum/categories";
      const response = await apiRequest(url);
      if (response && Array.isArray(response)) {
        // Convert API response to ForumCategory format
        const categories = response.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description || "",
          is_locked: cat.is_locked || false,
          is_pinned: cat.is_pinned || false,
          display_order: cat.display_order || 0,
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

  // Re-fetch on WS reconnect so stale category state is cleared after a
  // server restart or sleep/wake cycle (same guard pattern as Store.tsx).
  const socket = useAtomValue(socketAtom);
  const socketMounted = useRef(false);
  useEffect(() => {
    if (!socketMounted.current) {
      socketMounted.current = true;
      return;
    }
    if (socket) loadForums();
  }, [socket, loadForums]);

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

  const handleToggleCategoryLock = async (
    categoryId: string,
    locked: boolean,
  ) => {
    try {
      await apiRequest(`/forum/categories/${categoryId}`, {
        method: "PUT",
        body: JSON.stringify({ is_locked: locked }),
      });
      loadForums();
    } catch (error) {
      console.error("Error toggling category lock:", error);
    }
  };

  const handleToggleCategoryPin = async (
    categoryId: string,
    pinned: boolean,
  ) => {
    try {
      await apiRequest(`/forum/categories/${categoryId}/pin`, {
        method: "PUT",
        body: JSON.stringify({ is_pinned: pinned }),
      });
      loadForums();
    } catch (error) {
      console.error("Error toggling category pin:", error);
    }
  };

  const handleToggleThreadPin = async (
    threadId: string,
    pinned: boolean,
  ) => {
    try {
      await apiRequest(`/forum/threads/${threadId}/pin`, {
        method: "PUT",
        body: JSON.stringify({ is_pinned: pinned }),
      });
      loadForums();
    } catch (error) {
      console.error("Error toggling thread pin:", error);
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
  const canEditCategories =
    currentUser?.permissions?.includes("forum.category-edit") ||
    currentUser?.roles?.includes("admin") ||
    guestSandboxMode;

  const totalThreads = forums.reduce((acc, f) => acc + (f.thread_count || 0), 0);
  const totalCategories = forums.length;
  const allThreads = forums.flatMap(f => f.threads || []);
  const newestThread = allThreads.length > 0 
    ? allThreads.reduce((latest, t) => new Date(t.created_at || 0) > new Date(latest.created_at || 0) ? t : latest, allThreads[0])
    : null;
  const newestForumUpdate = forums.length > 0
    ? forums.reduce((latest, f) => new Date(f.updated_at || 0) > new Date(latest.updated_at || 0) ? f : latest, forums[0])
    : null;

  const metrics = [
    <span key="threads"><strong>{totalThreads}</strong> {totalThreads === 1 ? 'Thread' : 'Threads'} in <strong>{totalCategories}</strong> {totalCategories === 1 ? 'Category' : 'Categories'}</span>,
    newestThread?.created_at ? <span key="last-created">Last created <strong>{relativeTimeAgo(newestThread.created_at)}</strong></span> : <span key="last-created">Last created <strong>N/A</strong></span>,
    newestForumUpdate?.updated_at ? <span key="last-contributed">Last contributed <strong>{relativeTimeAgo(newestForumUpdate.updated_at)}</strong></span> : <span key="last-contributed">Last contributed <strong>N/A</strong></span>
  ];

  return (
    <>
      <DirectoryLayout
        className="forum-container"
        title="Forums"
        subtitle="Browse categories, join discussions, and share your thoughts with the community."
        searchPlaceholder={viewMode === "grid" ? "Search categories..." : "Search threads..."}
        searchValue={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
          searchDebounceRef.current = setTimeout(() => {
            loadForums(val);
          }, 300);
        }}
        metrics={metrics}
        items={forumsLoading && forums.length === 0 
          ? Array.from({ length: 3 }, (_, i) => ({
              id: `skeleton-${i}`,
              name: "",
              description: "",
              is_locked: false,
              is_pinned: false,
              display_order: 0,
              thread_count: 0,
              created_at: "",
              updated_at: "",
              threads: [],
            }))
          : forums}
        viewMode={viewMode}
        onViewModeChange={toggleView}
        customListContent={
          <div className="directory-layout__list">
            <CategoryThreadsFeed
              threads={listThreads}
              isLoading={threadsLoading}
              loading={threadsFetchingOlder}
              feedRef={feedRef}
              sentinelRef={sentinelRef}
              handleScroll={handleScroll}
              emptyMessage="No threads found."
            />
          </div>
        }
        prependGridCard={isAuthenticated ? (
          <div className="card card--interactive new-thread-card feature-card">
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
                      navigate("/forum/new-category");
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
        ) : null}
        renderGridCard={(forum) => {
          const loading = forumsLoading && forums.length === 0;

          return (
            <div
              key={forum.id}
              className="card card--interactive forum-category-card"
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
                  <h3 className="forum-category-title">
                    {forum.is_pinned && (
                      <span className="threads-feed-pinned-badge" title="Pinned" style={{ color: "var(--color-primary)", marginRight: '8px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'text-bottom' }}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                      </span>
                    )}
                    {forum.is_locked && (
                      <Lock size={14} className="category-lock-icon" />
                    )}
                    {forum.name}
                  </h3>
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
                        {forum.thread_count}
                      </span>
                      {canEditCategories && !loading && (
                        <>
                          <button
                            className={`action-btn pin-btn${forum.is_pinned ? " pinned" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCategoryPin(
                                forum.id,
                                !forum.is_pinned,
                              );
                            }}
                            title={
                              forum.is_pinned
                                ? "Unpin category"
                                : "Pin category"
                            }
                            style={forum.is_pinned ? { color: "var(--color-primary)" } : {}}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
                          </button>
                        <button
                          className={`action-btn lock-btn${forum.is_locked ? " locked" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCategoryLock(
                              forum.id,
                              !forum.is_locked,
                            );
                          }}
                          title={
                            forum.is_locked
                              ? "Unlock category"
                              : "Lock category"
                          }
                        >
                          {forum.is_locked ? (
                            <Unlock size={14} />
                          ) : (
                            <Lock size={14} />
                          )}
                        </button>
                        </>
                      )}
                      {canDeleteCategory && (
                        <button
                          className="action-btn danger"
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
                  <CategoryThreadsPreview
                    forum={forum}
                    currentUser={currentUser}
                    guestSandboxMode={guestSandboxMode}
                    navigate={navigate}
                    handleDeleteThread={handleDeleteThread}
                    handleToggleThreadPin={handleToggleThreadPin}
                  />
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
        }}
      />
    </>
  );
};

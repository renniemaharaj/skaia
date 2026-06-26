import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { currentUserAtom, isAuthenticatedAtom, socketAtom } from "../../atoms/auth";
import { type ForumCategory, forumCategoriesAtom } from "../../atoms/forum";
import { useLayoutPosition } from "../../atoms/viewModes";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

import "./Forum.css";
import "../ui/FeatureCard.css";
import "./NewThread.css";
import "../ui/FormGroup.css";

import { useNavigate } from "react-router-dom";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
import { useThreadsFeed } from "../../hooks/useThreadsFeed";
import { relativeTimeAgo } from "../../utils/serverTime";
import CategoryThreadsFeed from "./CategoryThreadsFeed";
import { ForumActionCard } from "./ForumActionCard";
import { ForumCategoryCard } from "./ForumCategoryCard";

interface ForumCategoryApiResponse {
  id: string;
  name: string;
  description?: string;
  is_locked?: boolean;
  is_pinned?: boolean;
  display_order?: number;
  thread_count?: number;
  created_at: string;
  updated_at: string;
  threads?: ForumCategory["threads"];
}

export const Forum: React.FC = () => {
  const [forumsLoading, setForumsLoading] = useState(true);
  const [viewMode, setViewMode] = useLayoutPosition<"grid" | "list">("forum", "grid");
  const [isCompactForum, setIsCompactForum] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 880px)").matches
  );
  const [searchQuery, setSearchQuery] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const effectiveViewMode = isCompactForum ? "grid" : viewMode;

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

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(max-width: 880px)");
    const updateCompactForum = () => setIsCompactForum(mediaQuery.matches);
    updateCompactForum();
    mediaQuery.addEventListener("change", updateCompactForum);
    return () => mediaQuery.removeEventListener("change", updateCompactForum);
  }, []);

  // Load forums from API
  const loadForums = useCallback(
    async (query?: string) => {
      try {
        setForumsLoading(true);
        const url = query
          ? `/forum/categories?q=${encodeURIComponent(query)}`
          : "/forum/categories";
        const response = await apiRequest<ForumCategoryApiResponse[]>(url);
        if (response && Array.isArray(response)) {
          // Convert API response to ForumCategory format
          const categories = response.map(cat => ({
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
          for (const category of categories) {
            subscribe("forum_category", category.id);
          }
        }
      } catch (error) {
        console.error("Error loading forums:", error);
      } finally {
        setForumsLoading(false);
      }
    },
    [setForumCategories, subscribe]
  );

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

  const handleToggleCategoryLock = async (categoryId: string, locked: boolean) => {
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

  const handleToggleCategoryPin = async (categoryId: string, pinned: boolean) => {
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

  const handleToggleThreadPin = async (threadId: string, pinned: boolean) => {
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
    }).catch(error => {
      console.error("Error deleting thread:", error);
    });
  };

  const canCreateCategory =
    currentUser?.permissions?.includes("forum.category-new") || guestSandboxMode;
  const canDeleteCategory =
    currentUser?.permissions?.includes("forum.category-delete") || guestSandboxMode;
  const canEditCategories =
    currentUser?.permissions?.includes("forum.category-edit") ||
    currentUser?.roles?.includes("admin") ||
    guestSandboxMode;

  const totalThreads = forums.reduce((acc, f) => acc + (f.thread_count || 0), 0);
  const totalCategories = forums.length;
  const allThreads = forums.flatMap(f => f.threads || []);
  const newestThread =
    allThreads.length > 0
      ? allThreads.reduce(
          (latest, t) =>
            new Date(t.created_at || 0) > new Date(latest.created_at || 0) ? t : latest,
          allThreads[0]
        )
      : null;
  const newestForumUpdate =
    forums.length > 0
      ? forums.reduce(
          (latest, f) =>
            new Date(f.updated_at || 0) > new Date(latest.updated_at || 0) ? f : latest,
          forums[0]
        )
      : null;

  const metrics = [
    <span key="threads">
      <strong>{totalThreads}</strong> {totalThreads === 1 ? "Thread" : "Threads"} in{" "}
      <strong>{totalCategories}</strong> {totalCategories === 1 ? "Category" : "Categories"}
    </span>,
    newestThread?.created_at ? (
      <span key="last-created">
        Last created <strong>{relativeTimeAgo(newestThread.created_at)}</strong>
      </span>
    ) : (
      <span key="last-created">
        Last created <strong>N/A</strong>
      </span>
    ),
    newestForumUpdate?.updated_at ? (
      <span key="last-contributed">
        Last contributed <strong>{relativeTimeAgo(newestForumUpdate.updated_at)}</strong>
      </span>
    ) : (
      <span key="last-contributed">
        Last contributed <strong>N/A</strong>
      </span>
    ),
  ];

  return (
    <>
      <DirectoryLayout
        className="forum-container"
        title="Forums"
        subtitle="Browse categories, join discussions, and share your thoughts with the community."
        searchPlaceholder={
          effectiveViewMode === "grid" ? "Search categories..." : "Search threads..."
        }
        searchValue={searchQuery}
        onSearchChange={val => {
          setSearchQuery(val);
          if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
          searchDebounceRef.current = setTimeout(() => {
            loadForums(val);
          }, 300);
        }}
        metrics={metrics}
        items={
          forumsLoading && forums.length === 0
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
            : forums
        }
        viewMode={effectiveViewMode}
        onViewModeChange={isCompactForum ? undefined : toggleView}
        customListContent={
          <CategoryThreadsFeed
            threads={listThreads}
            isLoading={threadsLoading}
            loading={threadsFetchingOlder}
            feedRef={feedRef}
            sentinelRef={sentinelRef}
            handleScroll={handleScroll}
            emptyMessage="No threads found."
          />
        }
        prependGridCard={
          isAuthenticated ? (
            <ForumActionCard canCreateCategory={canCreateCategory} navigate={navigate} />
          ) : null
        }
        renderGridCard={forum => {
          const loading = forumsLoading && forums.length === 0;

          return (
            <ForumCategoryCard
              key={forum.id}
              forum={forum}
              loading={loading}
              currentUser={currentUser}
              guestSandboxMode={guestSandboxMode}
              canEditCategories={canEditCategories}
              canDeleteCategory={canDeleteCategory}
              navigate={navigate}
              onDeleteCategory={handleDeleteCategory}
              onToggleCategoryLock={handleToggleCategoryLock}
              onToggleCategoryPin={handleToggleCategoryPin}
              onDeleteThread={handleDeleteThread}
              onToggleThreadPin={handleToggleThreadPin}
            />
          );
        }}
      />
    </>
  );
};

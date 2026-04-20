import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasPermissionAtom, currentUserAtom } from "../atoms/auth";
import { apiRequest } from "../utils/api";

export interface PageUser {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface PageBuilderPage {
  id: number;
  slug: string;
  title: string;
  description: string;
  content: string; // JSON string of landing sections
  owner_id?: number | null;
  owner?: PageUser | null;
  editors?: PageUser[];
  visibility?: string;
  view_count: number;
  likes: number;
  is_liked: boolean;
  comment_count: number;
  can_edit?: boolean;
  can_delete?: boolean;
  created_at: string;
  updated_at: string;
}

interface UsePageDataReturn {
  page: PageBuilderPage | null;
  loading: boolean;
  error: string;
  errorStatus?: number;
  retryAfter?: number;
  isEditable: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  /** True when a page_updated WS event arrived while edits were in progress */
  pendingIncoming: boolean;
  refresh: (slug?: string) => Promise<void>;
  createPage: (
    page: Omit<PageBuilderPage, "id" | "created_at" | "updated_at">,
  ) => Promise<PageBuilderPage>;
  updatePage: (
    page: Omit<PageBuilderPage, "created_at" | "updated_at">,
  ) => Promise<PageBuilderPage>;
  deletePage: (id: number) => Promise<void>;
  duplicatePage: (
    id: number,
    newSlug: string,
    newTitle?: string,
  ) => Promise<PageBuilderPage>;
}

export function usePageData(suppressLiveRefresh = false): UsePageDataReturn {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const isAdmin = hasPermission("home.manage");

  const [page, setPage] = useState<PageBuilderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
  const [pendingIncoming, setPendingIncoming] = useState(false);
  const currentSlugRef = useRef<string | null>(null);
  const requestedSlugRef = useRef<string | undefined>(undefined);
  const requestIdRef = useRef(0);
  const suppressRef = useRef(suppressLiveRefresh);
  const pendingDataRef = useRef<any>(null);

  /**
   * Merge an incoming WS page payload into the current page state.
   * Preserves per-user computed fields (is_liked, can_delete) that the
   * broadcast doesn't carry, while applying content / metadata changes
   * so the section-sync useEffect in PageBuilder can run mergeSections
   * without an HTTP round-trip or loading-skeleton flash.
   */
  const applyIncomingData = useCallback((data: any) => {
    setPage((prev) => {
      if (!prev || !data) return prev;
      return {
        ...prev,
        ...data,
        // Always preserve per-user computed fields
        is_liked: prev.is_liked,
        can_delete: prev.can_delete,
      };
    });
  }, []);

  useEffect(() => {
    suppressRef.current = suppressLiveRefresh;
    // If suppression was just lifted and there's a pending update, apply it now.
    if (!suppressLiveRefresh && pendingIncoming) {
      setPendingIncoming(false);
      const pending = pendingDataRef.current;
      pendingDataRef.current = null;
      if (pending) {
        // Apply stored WS data directly — no HTTP round trip, no flicker.
        applyIncomingData(pending);
      } else {
        // Fallback: no stored data (shouldn't normally happen).
        const slug = currentSlugRef.current;
        if (slug) void refresh(slug);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressLiveRefresh]);

  const isOwner = !!(
    page?.owner_id &&
    currentUser &&
    Number(page.owner_id) === Number(currentUser.id)
  );
  const isEditor = !!page?.editors?.some(
    (e) => currentUser && Number(e.id) === Number(currentUser.id),
  );
  const isEditable = isAdmin || isOwner || isEditor;

  const refresh = useCallback(async (slug?: string) => {
    const requestId = ++requestIdRef.current;
    // Only clear page state when navigating to a genuinely different slug.
    // Re-fetching the same slug (e.g. after an update) keeps old data visible
    // so sections don't flash/revert while the request is in flight.
    const isSlugChange = slug !== requestedSlugRef.current;
    requestedSlugRef.current = slug;

    setLoading(true);
    setError("");
    setErrorStatus(undefined);
    setRetryAfter(undefined);

    if (isSlugChange) {
      setPage(null);
      currentSlugRef.current = null;
    }

    try {
      let endpoint: string;
      if (slug) {
        endpoint = `/config/pages/${slug}`;
      } else {
        // Index mode: resolve the landing slug first, then fetch by slug.
        // This avoids the single /config/pages/index cache key that CDNs
        // serve stale when the landing page is swapped — the per-slug URL
        // has a unique cache key per page.
        const cfg = await apiRequest<{ slug: string }>(
          "/config/pages/landing-slug",
        );
        if (requestId !== requestIdRef.current) return;
        endpoint = `/config/pages/${cfg.slug}`;
      }
      const currentPage = await apiRequest<PageBuilderPage>(endpoint);
      if (requestId !== requestIdRef.current) return;
      setPage(currentPage);
      currentSlugRef.current = currentPage?.slug ?? null;
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : "Failed to load page";
      const status = err instanceof Error ? (err as any).status : undefined;
      const retry = err instanceof Error ? (err as any).retryAfter : undefined;
      setPage(null);
      setError(msg);
      setErrorStatus(status);
      setRetryAfter(retry);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const createPage = useCallback(
    async (p: Omit<PageBuilderPage, "id" | "created_at" | "updated_at">) => {
      try {
        const created = await apiRequest<PageBuilderPage>("/config/pages", {
          method: "POST",
          body: JSON.stringify(p),
        });
        return created;
      } catch (err) {
        // 409 Conflict: page with this slug already exists.
        // The backend returns the existing page in the response body, but
        // apiRequest already consumed it. Fetch by slug instead.
        if (err instanceof Error && (err as any).status === 409) {
          const existing = await apiRequest<PageBuilderPage>(
            `/config/pages/${encodeURIComponent(p.slug)}`,
          );
          return existing;
        }
        throw err;
      }
    },
    [],
  );

  const updatePage = useCallback(
    async (p: Omit<PageBuilderPage, "created_at" | "updated_at">) => {
      const updated = await apiRequest<PageBuilderPage>(
        `/config/pages/${p.id}`,
        {
          method: "PUT",
          body: JSON.stringify(p),
        },
      );
      // The backend no longer echoes page:update back to the sender, so we
      // use the HTTP response as the authoritative update for local state.
      if (updated) setPage(updated);
      return updated;
    },
    [],
  );

  const deletePage = useCallback(async (id: number) => {
    await apiRequest(`/config/pages/${id}`, {
      method: "DELETE",
    });
  }, []);

  const duplicatePage = useCallback(
    async (id: number, newSlug: string, newTitle?: string) => {
      return await apiRequest<PageBuilderPage>(
        `/config/pages/${id}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ slug: newSlug, title: newTitle }),
        },
      );
    },
    [],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const { action, data } = (
        e as CustomEvent<{ action: string; data?: any }>
      ).detail;
      const slug = currentSlugRef.current;

      // Landing page was swapped to a different page — replace entirely.
      // Only applies when the hook is in "index" mode (no explicit slug).
      if (action === "landing_page_changed" && data) {
        if (!requestedSlugRef.current) {
          // We're on the index route — swap to the new landing page.
          setPage(data as PageBuilderPage);
          currentSlugRef.current = data.slug ?? null;
          return;
        }
      }

      if (!slug) return;

      if (
        action === "page_updated" &&
        (data?.slug === slug || data?.id === page?.id)
      ) {
        if (suppressRef.current) {
          // Hold the incoming update — store the data and apply when editing ends.
          pendingDataRef.current = data;
          setPendingIncoming(true);
        } else {
          // Apply WS data directly — no HTTP round trip, no loading flash.
          applyIncomingData(data);
        }
      } else if (action === "page_deleted" && data?.id === page?.id) {
        if (suppressRef.current) {
          setPendingIncoming(true);
        } else {
          refresh(slug);
        }
      }
    };
    window.addEventListener("page:live:event", handler);
    return () => window.removeEventListener("page:live:event", handler);
  }, [page?.id, refresh, applyIncomingData]);

  useEffect(() => {
    const handler = () => {
      if (errorStatus === 429) {
        void refresh(requestedSlugRef.current);
      }
    };
    window.addEventListener("api:rate-limit-cleared", handler);
    return () => window.removeEventListener("api:rate-limit-cleared", handler);
  }, [errorStatus, refresh]);

  return {
    page,
    loading,
    error,
    errorStatus,
    retryAfter,
    isEditable,
    isAdmin,
    isOwner,
    pendingIncoming,
    refresh,
    createPage,
    updatePage,
    deletePage,
    duplicatePage,
  };
}

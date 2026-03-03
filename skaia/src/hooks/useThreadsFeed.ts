import { useState, useEffect, useRef, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { apiRequest } from "../utils/api";
import {
  type ForumThread,
  categoryFeedThreadsAtom,
  activeCategoryFeedIdAtom,
  userFeedThreadsAtom,
  activeUserFeedIdAtom,
} from "../atoms/forum";

/** Convenience alias — keeps imports in consumers unchanged. */
export type FeedThread = ForumThread;

interface Options {
  /** Filter threads by author */
  authorId?: string;
  /** Filter threads by category */
  categoryId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 15;

export function useThreadsFeed({
  authorId,
  categoryId,
  limit = DEFAULT_LIMIT,
}: Options) {
  const isCategory = Boolean(categoryId);
  const filterKey = categoryId ?? authorId;

  // Pick the correct atom pair based on filter type
  const threads = useAtomValue(
    isCategory ? categoryFeedThreadsAtom : userFeedThreadsAtom,
  );
  const setThreads = useSetAtom(
    isCategory ? categoryFeedThreadsAtom : userFeedThreadsAtom,
  );
  const setActiveId = useSetAtom(
    isCategory ? activeCategoryFeedIdAtom : activeUserFeedIdAtom,
  );

  // Render-triggering loading states
  const [isLoading, setIsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Pagination bookkeeping in refs (stable, no re-render overhead)
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const exhaustedRef = useRef(false);
  // True from filter-change until the first page finishes loading
  const isInitialLoadRef = useRef(true);

  // The scrollable feed container and the top-sentinel for loading older items
  const feedRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Track whether the user is near the bottom so WS-driven appends auto-scroll
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  // ── Scroll helpers ─────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  }, []);

  // ── URL builder ───────────────────────────────────────────────────────────

  const buildUrl = useCallback(
    (offset: number) => {
      const param = categoryId
        ? `category_id=${categoryId}`
        : `author_id=${authorId}`;
      return `/forum/threads?${param}&limit=${limit}&offset=${offset}`;
    },
    [categoryId, authorId, limit],
  );

  // ── Initial load ──────────────────────────────────────────────────────────

  const loadInitial = useCallback(async () => {
    if (!filterKey) return;
    setIsLoading(true);
    setThreads([]);
    offsetRef.current = 0;
    exhaustedRef.current = false;
    prevCountRef.current = 0;
    isInitialLoadRef.current = true;
    try {
      const res = await apiRequest<{ threads: ForumThread[] }>(buildUrl(0));
      const page = res?.threads ?? [];
      // API returns newest-first (DESC); reverse so oldest is at top → newest visible at bottom
      setThreads([...page].reverse());
      offsetRef.current = page.length;
      if (page.length < limit) exhaustedRef.current = true;
    } catch {
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterKey, buildUrl, limit, setThreads]);

  // ── Load older (top sentinel) ─────────────────────────────────────────────

  const loadOlder = useCallback(async () => {
    if (!filterKey || loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    // Anchor current view: remember scroll distance from the bottom before prepend
    const prevScrollHeight = feedRef.current?.scrollHeight ?? 0;
    try {
      const res = await apiRequest<{ threads: ForumThread[] }>(
        buildUrl(offsetRef.current),
      );
      const page = res?.threads ?? [];
      if (page.length > 0) {
        setThreads((prev) => [...[...page].reverse(), ...prev]);
        offsetRef.current += page.length;
        if (page.length < limit) exhaustedRef.current = true;

        // Restore the user's scroll position after prepend
        requestAnimationFrame(() => {
          if (feedRef.current) {
            feedRef.current.scrollTop +=
              feedRef.current.scrollHeight - prevScrollHeight;
          }
        });
      } else {
        exhaustedRef.current = true;
      }
    } catch {
      // silently fail
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [filterKey, buildUrl, limit, setThreads]);

  // ── Register active feed + trigger initial load when filter changes ────────

  useEffect(() => {
    if (!filterKey) return;
    setActiveId(filterKey);
    loadInitial();
    return () => {
      setActiveId(null);
    };
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to bottom once the initial load completes ──────────────────────

  useEffect(() => {
    if (!isLoading) {
      requestAnimationFrame(scrollToBottom);
      prevCountRef.current = threads.length;
      isInitialLoadRef.current = false;
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll when WS appends a new thread ─────────────────────────────

  useEffect(() => {
    if (isInitialLoadRef.current) return;
    const prev = prevCountRef.current;
    prevCountRef.current = threads.length;
    if (threads.length > prev && feedRef.current && isAtBottomRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── IntersectionObserver on the top sentinel ──────────────────────────────

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isInitialLoadRef.current) {
          loadOlder();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadOlder]);

  return {
    threads,
    isLoading, // true while the first page is fetching
    loading, // true while loading older items via the top sentinel
    feedRef,
    sentinelRef,
    handleScroll,
  };
}

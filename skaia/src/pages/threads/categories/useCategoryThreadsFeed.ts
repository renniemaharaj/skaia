import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "../../../utils/api";
import type { ForumThread } from "../../users/types";

const THREADS_PER_PAGE = 15;

export function useCategoryThreadsFeed(categoryId: string | undefined) {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (!categoryId || loading || exhausted) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ threads: ForumThread[] }>(
        `/forum/threads?category_id=${categoryId}&limit=${THREADS_PER_PAGE}&offset=${offset}`,
      );
      const next = res?.threads ?? [];
      setThreads((prev) => [...prev, ...next]);
      setOffset((prev) => prev + next.length);
      if (next.length < THREADS_PER_PAGE) setExhausted(true);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [categoryId, offset, loading, exhausted]);

  // Reset when categoryId changes
  useEffect(() => {
    setThreads([]);
    setOffset(0);
    setExhausted(false);
  }, [categoryId]);

  // Trigger first page
  useEffect(() => {
    if (categoryId && threads.length === 0 && !exhausted && !loading) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, exhausted]);

  // IntersectionObserver on sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return { threads, loading, sentinelRef };
}

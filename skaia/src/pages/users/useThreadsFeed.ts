import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "../../utils/api";
import { THREADS_PER_PAGE, type ForumThread } from "./types";

export function useThreadsFeed(userId: string | undefined) {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [threadsOffset, setThreadsOffset] = useState(0);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsExhausted, setThreadsExhausted] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (!userId || threadsLoading || threadsExhausted) return;
    setThreadsLoading(true);
    try {
      const res = await apiRequest<{ threads: ForumThread[] }>(
        `/forum/threads?author_id=${userId}&limit=${THREADS_PER_PAGE}&offset=${threadsOffset}`,
      );
      const next = res?.threads ?? [];
      setThreads((prev) => [...prev, ...next]);
      setThreadsOffset((prev) => prev + next.length);
      if (next.length < THREADS_PER_PAGE) setThreadsExhausted(true);
    } catch {
      // silently fail
    } finally {
      setThreadsLoading(false);
    }
  }, [userId, threadsOffset, threadsLoading, threadsExhausted]);

  // Reset when userId changes
  useEffect(() => {
    setThreads([]);
    setThreadsOffset(0);
    setThreadsExhausted(false);
  }, [userId]);

  // Trigger first page
  useEffect(() => {
    if (
      userId &&
      threads.length === 0 &&
      !threadsExhausted &&
      !threadsLoading
    ) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, threadsExhausted]);

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

  return { threads, threadsLoading, sentinelRef };
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface UseCommentsFeedOptions<T> {
  comments: T[];
  setComments: Dispatch<SetStateAction<T[]>>;
  loadPage: (offset: number) => Promise<T[]>;
  deps: unknown[];
  getId: (item: T) => string | number;
  limit?: number;
}

export function useCommentsFeed<T>({
  comments,
  setComments,
  loadPage,
  deps,
  getId,
  limit = 50,
}: UseCommentsFeedOptions<T>) {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [highlightedCommentId, setHighlightedCommentId] = useState<
    string | number | null
  >(null);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const offsetRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const exhaustedRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const prevCountRef = useRef(0);
  const isAtBottomRef = useRef(true);

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

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setComments([]);
    offsetRef.current = 0;
    exhaustedRef.current = false;
    loadingOlderRef.current = false;
    prevCountRef.current = 0;
    isInitialLoadRef.current = true;
    setHighlightedCommentId(null);

    try {
      const page = await loadPage(0);
      setComments(page ?? []);
      offsetRef.current = page?.length ?? 0;
      if ((page?.length ?? 0) < limit) exhaustedRef.current = true;
    } catch {
      setComments([]);
      exhaustedRef.current = true;
    } finally {
      setIsLoading(false);
    }
  }, [loadPage, limit, setComments]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || exhaustedRef.current) return;
    loadingOlderRef.current = true;
    setIsLoadingOlder(true);

    const prevScrollHeight = feedRef.current?.scrollHeight ?? 0;
    try {
      const page = await loadPage(offsetRef.current);
      if (!page?.length) {
        exhaustedRef.current = true;
        return;
      }

      setComments((prev) => {
        const next = [...page, ...prev];
        return next;
      });
      offsetRef.current += page.length;
      if (page.length < limit) exhaustedRef.current = true;

      requestAnimationFrame(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop +=
            feedRef.current.scrollHeight - prevScrollHeight;
        }
      });
    } catch {
      // ignore load errors for older pages
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [loadPage, limit, setComments]);

  useEffect(() => {
    loadInitial();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoading) {
      requestAnimationFrame(scrollToBottom);
      prevCountRef.current = comments.length;
      isInitialLoadRef.current = false;
    }
  }, [isLoading, comments.length, scrollToBottom]);

  useEffect(() => {
    if (isInitialLoadRef.current || loadingOlderRef.current) return;
    const prev = prevCountRef.current;
    prevCountRef.current = comments.length;

    if (comments.length > prev) {
      const lastComment = comments[comments.length - 1];
      if (lastComment) {
        setHighlightedCommentId(getId(lastComment));
      }
      if (feedRef.current && isAtBottomRef.current) {
        feedRef.current.scrollTop = feedRef.current.scrollHeight;
      }
    }
  }, [comments.length, comments, getId]);

  useEffect(() => {
    if (highlightedCommentId == null) return;
    const timeout = window.setTimeout(() => {
      setHighlightedCommentId(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [highlightedCommentId]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isInitialLoadRef.current) {
          loadOlder();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadOlder]);

  const appendComment = useCallback(
    (comment: T) => {
      setComments((prev) => {
        const id = String(getId(comment));
        if (prev.some((item) => String(getId(item)) === id)) {
          return prev;
        }
        return [...prev, comment];
      });
    },
    [getId, setComments],
  );

  return {
    comments,
    setComments,
    feedRef,
    sentinelRef,
    handleScroll,
    isLoading,
    isLoadingOlder,
    appendComment,
    highlightedCommentId,
  };
}

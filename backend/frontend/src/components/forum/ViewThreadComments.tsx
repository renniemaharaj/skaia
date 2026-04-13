import { useEffect, useRef, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  threadCommentsAtom,
  enrichedThreadCommentsAtom,
} from "../../atoms/forum";
import { type ThreadComment } from "../../atoms/forum";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { currentUserAtom } from "../../atoms/auth";
import CommentSection from "../comments/CommentSection";

const ViewThreadComments = ({ threadId }: { threadId: string | undefined }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const comments = useAtomValue(enrichedThreadCommentsAtom);
  const setComments = useSetAtom(threadCommentsAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const { subscribe } = useWebSocketSync();
  const feedRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  // Track whether user is near the bottom of the feed
  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  }, []);

  // Load comments when thread changes
  useEffect(() => {
    if (!threadId) return;

    // Immediately clear stale comments from the previous thread
    setComments([]);
    prevCountRef.current = 0;
    isAtBottomRef.current = true;

    const loadComments = async () => {
      try {
        setIsLoading(true);
        const response = await apiRequest(
          `/forum/threads/${threadId}/comments`,
        );
        // Always set — even if null/empty — so stale data never lingers
        setComments(
          Array.isArray(response) ? (response as ThreadComment[]) : [],
        );
        // Subscribe to thread so we get real-time comment updates
        subscribe("thread", threadId);
      } catch (error) {
        console.error("Error loading comments:", error);
        setComments([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadComments();
  }, [threadId, setComments, subscribe]);

  // Scroll to bottom once comments finish loading
  useEffect(() => {
    if (!isLoading && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      isAtBottomRef.current = true;
    }
  }, [isLoading]);

  // Auto-scroll when new comments arrive (only if already near bottom)
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = comments.length;
    if (comments.length > prev && feedRef.current && isAtBottomRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      await apiRequest(`/forum/comments/${commentId}`, {
        method: "DELETE",
      });
      // Comment will be removed through WebSocket propagation
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  }, []);

  const handleLikeComment = useCallback(
    async (commentId: string, isCurrentlyLiked: boolean) => {
      // Optimistically flip is_liked immediately for the acting user
      setComments((prev) =>
        prev.map((p) =>
          p.id === commentId
            ? {
                ...p,
                is_liked: !isCurrentlyLiked,
                likes: isCurrentlyLiked
                  ? Math.max(0, p.likes - 1)
                  : p.likes + 1,
              }
            : p,
        ),
      );
      try {
        if (isCurrentlyLiked) {
          await apiRequest(`/forum/comments/${commentId}/like`, {
            method: "DELETE",
          });
        } else {
          await apiRequest(`/forum/comments/${commentId}/like`, {
            method: "POST",
          });
        }
        // Count will be corrected by WebSocket propagation
      } catch (error) {
        console.error("Error toggling like:", error);
        // Revert optimistic update on failure
        setComments((prev) =>
          prev.map((p) =>
            p.id === commentId
              ? {
                  ...p,
                  is_liked: isCurrentlyLiked,
                  likes: isCurrentlyLiked
                    ? p.likes + 1
                    : Math.max(0, p.likes - 1),
                }
              : p,
          ),
        );
      }
    },
    [setComments],
  );

  return (
    <CommentSection
      title="Comments"
      comments={comments}
      isLoading={isLoading}
      canComment={(currentUser?.permissions ?? []).includes(
        "forum.thread-comment-new",
      )}
      onSubmit={async (text) => {
        if (!threadId || isSubmitting) return;
        try {
          setIsSubmitting(true);
          await apiRequest(`/forum/threads/${threadId}/comments`, {
            method: "POST",
            body: JSON.stringify({ content: text }),
          });
        } catch (error) {
          console.error("Error submitting comment:", error);
        } finally {
          setIsSubmitting(false);
        }
      }}
      onLike={(comment) =>
        void handleLikeComment(String(comment.id), comment.is_liked ?? false)
      }
      onDelete={(comment) => void handleDeleteComment(String(comment.id))}
      currentUserId={currentUser?.id}
      noCommentsText="No comments yet. Be the first!"
      placeholder="Write a comment… (Shift+Enter for new line)"
      rootClassName="view-thread-comments"
      commentsFeedRef={feedRef}
      onCommentsScroll={handleScroll}
      disabled={isSubmitting}
    />
  );
};

export default ViewThreadComments;

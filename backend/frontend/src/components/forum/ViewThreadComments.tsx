import { useEffect, useState, useCallback } from "react";
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
import { useCommentsFeed } from "../../hooks/useCommentsFeed";

const ViewThreadComments = ({ threadId }: { threadId: string | undefined }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const comments = useAtomValue(enrichedThreadCommentsAtom);
  const setComments = useSetAtom(threadCommentsAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const { subscribe } = useWebSocketSync();

  const {
    feedRef,
    sentinelRef,
    handleScroll,
    isLoading,
    highlightedCommentId,
  } = useCommentsFeed<ThreadComment>({
    comments,
    setComments,
    loadPage: async (offset) => {
      if (!threadId) return [];
      const response = await apiRequest<ThreadComment[]>(
        `/forum/threads/${threadId}/comments?limit=50&offset=${offset}`,
      );
      return response ?? [];
    },
    deps: [threadId],
    getId: (comment) => String(comment.id),
    limit: 50,
  });

  useEffect(() => {
    if (!threadId) return;
    subscribe("thread", threadId);
  }, [threadId, subscribe]);

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
      topSentinelRef={sentinelRef}
      highlightedCommentId={highlightedCommentId}
      onCommentsScroll={handleScroll}
      disabled={isSubmitting}
    />
  );
};

export default ViewThreadComments;

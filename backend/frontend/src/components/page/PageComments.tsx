import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import CommentSection from "../comments/CommentSection";
import { useCommentsFeed } from "../../hooks/useCommentsFeed";

interface PageComment {
  id: number;
  page_id: number;
  user_id: number;
  content: string;
  author_name: string;
  author_avatar: string;
  likes: number;
  is_liked: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  pageId: number;
  pageSlug: string;
}

export default function PageComments({ pageId, pageSlug }: Props) {
  const [comments, setComments] = useState<PageComment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const {
    feedRef,
    sentinelRef,
    handleScroll,
    isLoading,
    appendComment,
    highlightedCommentId,
  } = useCommentsFeed<PageComment>({
    comments,
    setComments,
    loadPage: async (offset) => {
      const response = await apiRequest<PageComment[]>(
        `/config/pages/${pageSlug}/comments?limit=50&offset=${offset}`,
      );
      return response ?? [];
    },
    deps: [pageSlug],
    getId: (comment) => String(comment.id),
    limit: 50,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const { action, data } = (
        e as CustomEvent<{ action: string; data?: any }>
      ).detail;
      if (data?.page_id !== pageId) return;

      if (action === "page_comment_created") {
        appendComment({
          ...data,
          likes: data.likes ?? 0,
          can_delete: data.can_delete ?? false,
          can_edit: data.can_edit ?? false,
          is_liked: data.is_liked ?? false,
        });
      }
      if (action === "page_comment_deleted") {
        setComments((prev) => prev.filter((c) => c.id !== data.id));
      }
    };
    window.addEventListener("page:live:event", handler);
    return () => window.removeEventListener("page:live:event", handler);
  }, [pageId, appendComment, setComments]);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await apiRequest<PageComment>(
        `/config/pages/${pageId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content: trimmed }),
        },
      );
      if (created?.id != null) {
        appendComment({
          ...created,
          likes: created.likes ?? 0,
          can_delete: created.can_delete ?? false,
          can_edit: created.can_edit ?? false,
          is_liked: created.is_liked ?? false,
        });
      }
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (comment: {
    id: number | string;
    is_liked?: boolean;
  }) => {
    const isLiked = Boolean(comment.is_liked);
    const method = isLiked ? "DELETE" : "POST";
    const optimistic = comments.map((c) =>
      c.id === comment.id
        ? {
            ...c,
            is_liked: !c.is_liked,
            likes: c.is_liked ? c.likes - 1 : c.likes + 1,
          }
        : c,
    );
    setComments(optimistic);
    try {
      await apiRequest(`/config/pages/comments/${comment.id}/like`, {
        method,
      });
    } catch {
      setComments(comments);
    }
  };

  const handleDelete = async (commentId: number) => {
    const previousComments = comments;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await apiRequest(`/config/pages/comments/${commentId}`, {
        method: "DELETE",
      });
    } catch {
      toast.error("Failed to delete comment");
      setComments(previousComments);
    }
  };

  const formattedComments = comments.map((comment) => ({
    id: comment.id,
    author_id: comment.user_id,
    author_name: comment.author_name,
    author_avatar: comment.author_avatar,
    content: comment.content,
    created_at: comment.created_at,
    likes: comment.likes,
    is_liked: comment.is_liked,
    can_delete: comment.can_delete,
  }));

  return (
    <div className="page-comments">
      <CommentSection
        title="Comments"
        comments={formattedComments}
        isLoading={isLoading}
        canComment={isAuthenticated}
        onSubmit={handleSubmit}
        onLike={handleLike}
        onDelete={(comment) => handleDelete(Number(comment.id))}
        currentUserId={isAuthenticated ? "signed-in" : null}
        noCommentsText="No comments yet."
        placeholder="Write a comment… (Shift+Enter for new line)"
        commentsFeedRef={feedRef}
        topSentinelRef={sentinelRef}
        highlightedCommentId={highlightedCommentId}
        onCommentsScroll={handleScroll}
        disabled={submitting}
      />
    </div>
  );
}

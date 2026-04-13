import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import CommentSection from "../comments/CommentSection";

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const loadComments = useCallback(async () => {
    try {
      const data = await apiRequest<PageComment[]>(
        `/config/pages/${pageSlug}/comments`,
      );
      setComments(data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [pageSlug]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { action, data } = (
        e as CustomEvent<{ action: string; data?: any }>
      ).detail;
      if (
        (action === "page_comment_created" && data?.page_id === pageId) ||
        (action === "page_comment_deleted" && data?.page_id === pageId)
      ) {
        loadComments();
      }
    };
    window.addEventListener("page:live:event", handler);
    return () => window.removeEventListener("page:live:event", handler);
  }, [pageId, loadComments]);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await apiRequest(`/config/pages/${pageId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed }),
      });
      loadComments();
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
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await apiRequest(`/config/pages/comments/${commentId}`, {
        method: "DELETE",
      });
    } catch {
      toast.error("Failed to delete comment");
      loadComments();
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
        isLoading={loading}
        canComment={isAuthenticated}
        onSubmit={handleSubmit}
        onLike={handleLike}
        onDelete={(comment) => handleDelete(Number(comment.id))}
        currentUserId={isAuthenticated ? "signed-in" : null}
        noCommentsText="No comments yet."
        placeholder="Write a comment… (Shift+Enter for new line)"
        disabled={submitting}
      />
    </div>
  );
}

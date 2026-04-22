import { useEffect, useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { hasPermissionAtom, isAuthenticatedAtom } from "../../atoms/auth";
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
  const [slowModeEnabled, setSlowModeEnabled] = useState(false);
  const [slowModeInterval, setSlowModeInterval] = useState(10);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canManageHome = hasPermission("home.manage");

  const loadSlowMode = useCallback(async () => {
    try {
      const data = await apiRequest<{ enabled: boolean; interval: number }>(
        "/config/comment-slowmode",
      );
      setSlowModeEnabled(data?.enabled ?? false);
      setSlowModeInterval(data?.interval ?? 10);
    } catch {
      // ignore
    }
  }, []);

  const toggleSlowMode = useCallback(async () => {
    try {
      const data = await apiRequest<{ enabled: boolean; interval: number }>(
        "/config/comment-slowmode",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: !slowModeEnabled,
            interval: slowModeInterval || 10,
          }),
        },
      );
      setSlowModeEnabled(data?.enabled ?? false);
      setSlowModeInterval(data?.interval ?? 10);
      toast.success(
        data?.enabled
          ? "Comment slow mode enabled"
          : "Comment slow mode disabled",
      );
    } catch {
      toast.error("Failed to update comment slow mode");
    }
  }, [slowModeEnabled, slowModeInterval]);

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
        `/pages/${pageSlug}/comments?limit=50&offset=${offset}`,
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

  useEffect(() => {
    void loadSlowMode();
    const handler = (e: Event) => {
      const { action, data } = (
        e as CustomEvent<{ action: string; data?: any }>
      ).detail;
      if (action === "comment_slowmode_updated") {
        setSlowModeEnabled(data?.enabled ?? false);
        setSlowModeInterval(data?.interval ?? 10);
      }
    };
    window.addEventListener("config:live:event", handler);
    return () => window.removeEventListener("config:live:event", handler);
  }, [loadSlowMode]);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await apiRequest<PageComment>(
        `/pages/${pageId}/comments`,
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
      await apiRequest(`/pages/comments/${comment.id}/like`, {
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
      await apiRequest(`/pages/comments/${commentId}`, {
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
        showSlowModeControl={canManageHome}
        slowModeEnabled={slowModeEnabled}
        slowModeInterval={slowModeInterval}
        onToggleSlowMode={toggleSlowMode}
      />
    </div>
  );
}

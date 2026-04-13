import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { ThumbsUp, Trash2, Send } from "lucide-react";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import { toast } from "sonner";
import "./PageComments.css";

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
  const [draft, setDraft] = useState("");
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

  const handleSubmit = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      await apiRequest(`/config/pages/${pageId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: draft.trim() }),
      });
      setDraft("");
      loadComments();
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (comment: PageComment) => {
    const method = comment.is_liked ? "DELETE" : "POST";
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

  return (
    <div className="page-comments">
      <h3 className="page-comments__title">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      {isAuthenticated && (
        <div className="page-comments__composer">
          <textarea
            className="page-comments__input"
            placeholder="Write a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            rows={2}
          />
          <button
            className="page-comments__submit"
            onClick={handleSubmit}
            disabled={!draft.trim() || submitting}
          >
            <Send size={14} />
            Post
          </button>
        </div>
      )}

      {loading && <p className="page-comments__status">Loading…</p>}

      {!loading && comments.length === 0 && (
        <p className="page-comments__status">No comments yet.</p>
      )}

      <div className="page-comments__list">
        {comments.map((c) => (
          <div key={c.id} className="page-comment">
            <div className="page-comment__header">
              {c.author_avatar ? (
                <img
                  src={c.author_avatar}
                  alt={c.author_name}
                  className="page-comment__avatar"
                />
              ) : (
                <div className="page-comment__avatar page-comment__avatar--placeholder">
                  {(c.author_name || "?")[0].toUpperCase()}
                </div>
              )}
              <span className="page-comment__author">{c.author_name}</span>
              <span className="page-comment__time">
                {relativeTimeAgo(c.created_at)}
              </span>
            </div>
            <p className="page-comment__content">{c.content}</p>
            <div className="page-comment__actions">
              {isAuthenticated && (
                <button
                  className={`page-comment__like-btn${c.is_liked ? " liked" : ""}`}
                  onClick={() => handleLike(c)}
                >
                  <ThumbsUp size={13} />
                  {c.likes > 0 && <span>{c.likes}</span>}
                </button>
              )}
              {c.can_delete && (
                <button
                  className="page-comment__delete-btn"
                  onClick={() => handleDelete(c.id)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

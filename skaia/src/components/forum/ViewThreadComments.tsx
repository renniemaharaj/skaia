import "./ViewThreadComments.css";
import { Send, ThumbsUp, Trash2, UserCog2Icon } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { threadCommentsAtom } from "../../atoms/forum";
import { type ThreadComment } from "../../atoms/forum";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { currentUserAtom } from "../../atoms/auth";
import UserLink from "../user/UserLink";

const ViewThreadComments = ({ threadId }: { threadId: string | undefined }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const comments = useAtomValue(threadCommentsAtom);
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

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !threadId || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const response = await apiRequest(`/forum/threads/${threadId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentText }),
      });

      if (response) {
        // Comment will be added through WebSocket propagation
        setCommentText("");
      }
    } catch (error) {
      console.error("Error submitting comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommentSubmit(e as unknown as React.FormEvent);
    }
    // Shift+Enter adds a new line (default behavior)
  };

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

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return (
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      " · " +
      d.toLocaleDateString([], { month: "short", day: "numeric" })
    );
  };

  return (
    <div className="view-thread-comments">
      <div className="comments-header">
        <h3>Comments</h3>
        <span className="comments-count">{comments.length}</span>
      </div>

      {/* Scrollable feed — newest messages at bottom */}
      <div className="comments-feed" ref={feedRef} onScroll={handleScroll}>
        {isLoading ? (
          <div className="comments-feed-empty">Loading comments…</div>
        ) : comments.length === 0 ? (
          <div className="comments-feed-empty">
            No comments yet. Be the first!
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="comment-card">
              <div className="comment-avatar">
                {comment.author_avatar ? (
                  <img src={comment.author_avatar} alt={comment.author_name} />
                ) : (
                  <UserCog2Icon size={30} style={{ opacity: 0.45 }} />
                )}
              </div>

              <div className="comment-body">
                <div className="comment-meta">
                  <UserLink
                    userId={comment.author_id || comment.user_id}
                    displayName={comment.author_name}
                    variant="subtle"
                    className="comment-author-link"
                  />
                  {comment.author_roles && comment.author_roles.length > 0 && (
                    <span className="comment-role">
                      {comment.author_roles.join(", ")}
                    </span>
                  )}
                  <span className="comment-date">
                    {formatTimestamp(comment.created_at)}
                  </span>
                  {comment.is_edited && (
                    <span className="comment-edited">(edited)</span>
                  )}
                </div>

                <div className="comment-content">{comment.content}</div>

                <div className="comment-actions">
                  {/* Like button */}
                  {currentUser && (
                    <button
                      className={`thread-action-btn like-btn${comment.is_liked ? " liked" : ""}`}
                      onClick={() =>
                        handleLikeComment(comment.id, comment.is_liked)
                      }
                      title={comment.is_liked ? "Unlike" : "Like"}
                    >
                      <ThumbsUp
                        size={14}
                        fill={comment.is_liked ? "currentColor" : "none"}
                      />
                      {comment.likes > 0 && <span>{comment.likes}</span>}
                    </button>
                  )}

                  {/* Delete */}
                  {(currentUser?.id === comment.user_id ||
                    comment.can_delete ||
                    currentUser?.permissions?.includes(
                      "forum.thread-comment-delete",
                    )) && (
                    <button
                      className="thread-action-btn delete-btn"
                      onClick={() => handleDeleteComment(comment.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {(currentUser?.permissions ?? []).includes(
        "forum.thread-comment-new",
      ) && (
        <div className="comment-composer">
          <form
            className="comment-composer-form"
            onSubmit={handleCommentSubmit}
          >
            <textarea
              className="comment-composer-input"
              placeholder="Write a comment… (Shift+Enter for new line)"
              rows={1}
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                // Auto-grow
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="comment-composer-send"
              disabled={isSubmitting || !commentText.trim()}
              title="Post comment"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ViewThreadComments;

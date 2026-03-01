import "./ViewThreadComments.css";
import { Send, ThumbsUp, Trash2, UserCog2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { threadCommentsAtom } from "../atoms/forum";
import { type ForumPost } from "../atoms/forum";
import { apiRequest } from "../utils/api";
import { useWebSocketSync } from "../hooks/useWebSocketSync";
import { currentUserAtom } from "../atoms/auth";

const ViewThreadComments = ({ threadId }: { threadId: string | undefined }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const comments = useAtomValue(threadCommentsAtom);
  const setComments = useSetAtom(threadCommentsAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const { subscribe } = useWebSocketSync();

  // Load comments when thread changes
  useEffect(() => {
    if (!threadId) return;

    const loadComments = async () => {
      try {
        setIsLoading(true);
        const response = await apiRequest(`/forum/threads/${threadId}/posts`);
        if (Array.isArray(response)) {
          setComments(response as ForumPost[]);
          // Subscribe to thread so we get real-time comment updates
          subscribe("thread", threadId);
        }
      } catch (error) {
        console.error("Error loading comments:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadComments();
  }, [threadId, setComments, subscribe]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !threadId || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const response = await apiRequest(`/forum/threads/${threadId}/posts`, {
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

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;

    try {
      await apiRequest(`/forum/posts/${commentId}`, {
        method: "DELETE",
      });
      // Comment will be removed through WebSocket propagation
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  return (
    <div className="view-thread-comments">
      <div className="comments-header">
        <h3>Comments for thread :: @{threadId}</h3>
        <span className="comments-count">{comments.length} Comments</span>
      </div>

      {isLoading ? (
        <div className="loading">Loading comments...</div>
      ) : (
        <div className="comments-list">
          {comments.map((comment) => (
            <div key={comment.id} className="comment-card">
              <div className="comment-avatar">
                {comment.author_avatar ? (
                  <img src={comment.author_avatar} alt={comment.author_name} />
                ) : (
                  <UserCog2Icon size={40} style={{ opacity: 0.5 }} />
                )}
              </div>

              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{comment.author_name}</span>
                  {comment.author_roles && comment.author_roles.length > 0 && (
                    <span className="comment-role">
                      {comment.author_roles.join(", ")}
                    </span>
                  )}
                  <span className="comment-date">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="comment-content">{comment.content}</div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {/* Reaction */}
                  <button
                    className="thread-action-btn like-btn"
                    title="Like"
                    disabled
                  >
                    <ThumbsUp size={20} />
                    <span>{comment.likes || 0}</span>
                  </button>

                  {/* Delete - only if user owns comment */}
                  {(currentUser?.id === comment.author_id ||
                    comment.can_delete) && (
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
          ))}
        </div>
      )}

      <div className="comment-form-wrapper">
        <form className="comment-form" onSubmit={handleCommentSubmit}>
          <textarea
            className="richtext-outline-1"
            placeholder="Write a comment..."
            rows={4}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="comment-form-actions">
            <button
              type="submit"
              className="comment-submit-btn"
              disabled={isSubmitting || !commentText.trim()}
            >
              <Send size={16} />
              <span>{isSubmitting ? "Posting..." : "Post Comment"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ViewThreadComments;

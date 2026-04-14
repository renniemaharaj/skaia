import { ThumbsUp, Trash2 } from "lucide-react";
import { useMemo, type RefObject } from "react";
import ComposerInput from "../input/Input";
import UserAvatar from "../user/UserAvatar";
import UserLink from "../user/UserLink";
import { formatDate } from "../../utils/serverTime";
import "./CommentSection.css";

type CommentSectionComment = {
  id: string | number;
  author_id?: string | number | null;
  author_name?: string | null;
  author_avatar?: string | null;
  author_username?: string | null;
  author_roles?: string[] | null;
  content: string;
  created_at: string;
  likes?: number;
  is_liked?: boolean;
  can_delete?: boolean;
  is_edited?: boolean;
};

interface CommentSectionProps {
  title?: string;
  comments: CommentSectionComment[];
  isLoading: boolean;
  canComment: boolean;
  onSubmit: (text: string) => Promise<void> | void;
  onLike?: (comment: CommentSectionComment) => Promise<void> | void;
  onDelete?: (comment: CommentSectionComment) => Promise<void> | void;
  currentUserId?: string | number | null;
  noCommentsText?: string;
  placeholder?: string;
  rootClassName?: string;
  commentsFeedRef?: RefObject<HTMLDivElement | null>;
  topSentinelRef?: RefObject<HTMLDivElement | null>;
  highlightedCommentId?: string | number | null;
  onCommentsScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  showCount?: boolean;
  disabled?: boolean;
}

const CommentSection = ({
  title = "Comments",
  comments,
  isLoading,
  canComment,
  onSubmit,
  onLike,
  onDelete,
  currentUserId,
  noCommentsText = "No comments yet.",
  placeholder = "Write a comment…",
  rootClassName = "",
  commentsFeedRef,
  topSentinelRef,
  highlightedCommentId,
  onCommentsScroll,
  showCount = true,
  disabled = false,
}: CommentSectionProps) => {
  const hasComments = comments.length > 0;

  const headerCount = useMemo(
    () => (showCount ? `(${comments.length})` : ""),
    [comments.length, showCount],
  );

  return (
    <div className={`comment-section ${rootClassName}`.trim()}>
      <div className="comments-header">
        <h3>{title}</h3>
        {showCount && <span className="comments-count">{headerCount}</span>}
      </div>

      <div
        className="comments-feed"
        ref={commentsFeedRef}
        onScroll={onCommentsScroll}
      >
        <div ref={topSentinelRef} className="comments-feed-sentinel" />
        {isLoading ? (
          <div className="comments-feed-empty">Loading comments…</div>
        ) : !hasComments ? (
          <div className="comments-feed-empty">{noCommentsText}</div>
        ) : (
          comments.map((comment) => {
            const authorDisplay =
              comment.author_name || comment.author_username || "Unknown";
            return (
              <div
                key={comment.id}
                className={`comment-card${
                  String(comment.id) === String(highlightedCommentId)
                    ? " new-comment"
                    : ""
                }`}
              >
                <div className="comment-avatar">
                  <UserAvatar
                    src={comment.author_avatar || undefined}
                    alt={authorDisplay}
                    size={32}
                    initials={authorDisplay?.[0]?.toUpperCase()}
                  />
                </div>

                <div className="comment-body">
                  <div className="comment-meta">
                    {comment.author_id ? (
                      <UserLink
                        userId={String(comment.author_id)}
                        displayName={authorDisplay}
                        variant="subtle"
                        className="comment-author-link"
                      />
                    ) : (
                      <span className="comment-author-link">
                        {authorDisplay}
                      </span>
                    )}
                    {comment.author_roles &&
                      comment.author_roles.length > 0 && (
                        <span className="comment-role">
                          {comment.author_roles.join(", ")}
                        </span>
                      )}
                    <span className="comment-date">
                      {formatDate(comment.created_at)}
                    </span>
                    {comment.is_edited && (
                      <span className="comment-edited">(edited)</span>
                    )}
                  </div>

                  <div className="comment-content">{comment.content}</div>

                  <div className="comment-actions">
                    {currentUserId && onLike && (
                      <button
                        className={`thread-action-btn like-btn${comment.is_liked ? " liked" : ""}`}
                        onClick={() => void onLike(comment)}
                        title={comment.is_liked ? "Unlike" : "Like"}
                        type="button"
                      >
                        <ThumbsUp
                          size={14}
                          fill={comment.is_liked ? "currentColor" : "none"}
                        />
                        {comment.likes && comment.likes > 0 && (
                          <span>{comment.likes}</span>
                        )}
                      </button>
                    )}
                    {onDelete && comment.can_delete && (
                      <button
                        className="thread-action-btn delete-btn"
                        onClick={() => void onDelete(comment)}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canComment && (
        <div className="comment-composer">
          <ComposerInput
            handleSend={async (text) => {
              if (disabled) return;
              await onSubmit(text);
            }}
            disabled={disabled}
            placeholder={placeholder}
            minRows={1}
            maxRows={5}
          />
        </div>
      )}
    </div>
  );
};

export default CommentSection;

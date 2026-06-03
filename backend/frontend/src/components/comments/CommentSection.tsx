import { ThumbsUp, Trash2 } from "lucide-react";
import { useMemo, useEffect, type RefObject, useState } from "react";
import ComposerInput from "../input/Input";
import UserAvatar from "../user/UserAvatar";
import UserLink from "../user/UserLink";
import UserProfileOverlay from "../user/UserProfileOverlay";
import RoleBadge from "../user/RoleBadge";
import { formatDate } from "../../utils/serverTime";
import Editor from "../forum/Editor";
import ViewThread from "../forum/ViewThread";
import SpotlightCard from "../ui/SpotlightCard";
import { apiRequest } from "../../utils/api";
import type { Role } from "../../pages/users/types";
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
  lockedMessage?: string;
  showSlowModeControl?: boolean;
  slowModeEnabled?: boolean;
  slowModeInterval?: number;
  onToggleSlowMode?: () => Promise<void> | void;
  useRichText?: boolean;
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
  lockedMessage,
  showSlowModeControl = false,
  slowModeEnabled = false,
  slowModeInterval,
  onToggleSlowMode,
  useRichText = false,
}: CommentSectionProps) => {
  const hasComments = comments.length > 0;
  const [richTextContent, setRichTextContent] = useState("");
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [allRoles, setAllRoles] = useState<Role[]>([]);

  useEffect(() => {
    apiRequest<Role[]>("/users/roles").then((r) => setAllRoles(r || []));
  }, []);

  const headerCount = useMemo(
    () => (showCount ? `(${comments.length})` : ""),
    [comments.length, showCount],
  );

  return (
    <div className={`comment-section ${rootClassName}`.trim()}>
      <div className="comments-header">
        <div className="comments-header-main">
          <h3>{title}</h3>
          {showCount && <span className="comments-count">{headerCount}</span>}
        </div>
        <div className="comment-slowmode-actions">
          {slowModeEnabled && !showSlowModeControl ? (
            <span className="comment-slowmode-indicator">
              Slow mode active
              {slowModeInterval ? ` — ${slowModeInterval}s` : ""}
            </span>
          ) : null}
          {showSlowModeControl ? (
            <button
              type="button"
              className={`comment-slowmode-toggle${slowModeEnabled ? " active" : ""}`}
              onClick={() => void onToggleSlowMode?.()}
            >
              {slowModeEnabled ? "Slow mode on" : "Enable slow mode"}
            </button>
          ) : null}
        </div>
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
              <SpotlightCard
                key={comment.id}
                className={`comment-card${
                  String(comment.id) === String(highlightedCommentId)
                    ? " new-comment"
                    : ""
                }`}
                spotlightColor="rgba(255,255,255,0.1)"
              >
                <div className="comment-avatar">
                  {comment.author_id ? (
                    <UserProfileOverlay userId={comment.author_id} fallbackName={authorDisplay} fallbackAvatar={comment.author_avatar || undefined}>
                      <UserAvatar
                        src={comment.author_avatar || undefined}
                        alt={authorDisplay}
                        size={30}
                        initials={authorDisplay?.[0]?.toUpperCase()}
                      />
                    </UserProfileOverlay>
                  ) : (
                    <UserAvatar
                      src={comment.author_avatar || undefined}
                      alt={authorDisplay}
                      size={30}
                      initials={authorDisplay?.[0]?.toUpperCase()}
                    />
                  )}
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
                    <div className="comment-roles" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginLeft: '0.2rem' }}>
                      {comment.author_roles &&
                        comment.author_roles.length > 0 &&
                        comment.author_roles.map(r => {
                          const roleDetails = allRoles.find(ar => ar.name === r);
                          return <RoleBadge key={r} role={roleDetails || r} style={{ fontSize: '0.65rem', padding: '1px 6px' }} />;
                        })
                      }
                    </div>
                    <span className="comment-date">
                      {formatDate(comment.created_at)}
                    </span>
                    {comment.is_edited && (
                      <span className="comment-edited">(edited)</span>
                    )}
                  </div>

                  {useRichText ? (
                    <div className="comment-content rich-text-comment">
                      <ViewThread content={comment.content} />
                    </div>
                  ) : (
                    <div className="comment-content">{comment.content}</div>
                  )}

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
              </SpotlightCard>
            );
          })
        )}
      </div>

      {lockedMessage && !canComment && (
        <div className="comment-locked-message">{lockedMessage}</div>
      )}

      {canComment && (
        <div className="comment-composer">
          {useRichText ? (
            isEditorVisible ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Editor
                  value={richTextContent}
                  onChange={setRichTextContent}
                  minHeight="80px"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    className="thread-action-btn btn-cancel"
                    style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    onClick={() => {
                      setIsEditorVisible(false);
                      setRichTextContent("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="thread-action-btn btn-submit"
                    style={{ alignSelf: 'flex-end', padding: '6px 12px', background: 'var(--primary-color)', color: 'white', borderRadius: '4px' }}
                    disabled={disabled || !richTextContent.trim() || richTextContent === "<p></p>"}
                    onClick={async () => {
                      if (disabled) return;
                      await onSubmit(richTextContent);
                      setRichTextContent("");
                      setIsEditorVisible(false);
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className="comment-composer-placeholder"
                onClick={() => setIsEditorVisible(true)}
              >
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Make a reply
              </div>
            )
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
};

export default CommentSection;

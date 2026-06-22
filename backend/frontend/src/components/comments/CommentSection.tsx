import { ThumbsUp, Trash2 } from "lucide-react";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../utils/api";
import { formatDate } from "../../utils/serverTime";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { lazy, Suspense } from "react";
const Editor = lazy(() => import("../forum/Editor"));
const ViewThread = lazy(() => import("../forum/ViewThread"));
import ComposerInput from "../input/Input";
import StarRating from "../ui/StarRating";
import RoleBadge from "../user/RoleBadge";
import UserAvatar from "../user/UserAvatar";
import UserLink from "../user/UserLink";
import UserProfileOverlay from "../user/UserProfileOverlay";
import type { Role } from "../user/types";
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
  rating?: number;
};

interface CommentSectionProps {
  title?: string;
  comments: CommentSectionComment[];
  isLoading: boolean;
  canComment: boolean;
  onSubmit: (text: string, rating?: number) => Promise<void> | void;
  onLike?: (comment: CommentSectionComment) => Promise<void> | void;
  onDelete?: (comment: CommentSectionComment) => Promise<void> | void;
  currentUserId?: string | number | null;
  enableRatings?: boolean;
  userHasReviewed?: boolean;
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
  enableRatings = false,
  userHasReviewed = false,
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
  const [selectedRating, setSelectedRating] = useState<number>(0);

  useEffect(() => {
    apiRequest<Role[]>("/users/roles").then(r => setAllRoles(r || []));
  }, []);

  const headerCount = useMemo(
    () => (showCount ? `(${comments.length})` : ""),
    [comments.length, showCount]
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

      <div className="comments-feed" ref={commentsFeedRef} onScroll={onCommentsScroll}>
        <div ref={topSentinelRef} className="comments-feed-sentinel" />
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <ContentFlatCard key={`skeleton-${i}`} className="comment-card">
              <div className="comment-avatar">
                <div className="skeleton skeleton-circle" style={{ width: 30, height: 30 }} />
              </div>

              <div className="comment-body">
                <div className="comment-meta">
                  <div className="skeleton skeleton-text" style={{ width: 120, height: 14 }} />
                  <div
                    className="skeleton skeleton-text"
                    style={{ width: 60, height: 12, marginLeft: 8 }}
                  />
                </div>

                <div
                  className="skeleton skeleton-text"
                  style={{ width: "70%", height: 12, marginTop: 8 }}
                />
                <div className="skeleton skeleton-text" style={{ width: "90%", height: 12 }} />
              </div>
            </ContentFlatCard>
          ))
        ) : !hasComments ? (
          <div className="comments-feed-empty">{noCommentsText}</div>
        ) : (
          comments.map(comment => {
            const authorDisplay = comment.author_name || comment.author_username || "Unknown";
            return (
              <ContentFlatCard
                key={comment.id}
                className={`comment-card${
                  String(comment.id) === String(highlightedCommentId) ? " new-comment" : ""
                }`}
                spotlightColor="rgba(255,255,255,0.1)"
              >
                <div className="comment-avatar">
                  {comment.author_id ? (
                    <UserProfileOverlay
                      userId={comment.author_id}
                      fallbackName={authorDisplay}
                      fallbackAvatar={comment.author_avatar || undefined}
                    >
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
                      <span className="comment-author-link">{authorDisplay}</span>
                    )}
                    <div
                      className="comment-roles"
                      style={{
                        display: "flex",
                        gap: "0.3rem",
                        flexWrap: "wrap",
                        marginLeft: "0.2rem",
                      }}
                    >
                      {comment.author_roles &&
                        comment.author_roles.length > 0 &&
                        comment.author_roles.map(r => {
                          const roleDetails = allRoles.find(ar => ar.name === r);
                          return (
                            <RoleBadge
                              key={r}
                              role={roleDetails || r}
                              style={{
                                fontSize: "0.65rem",
                                padding: "1px 6px",
                              }}
                            />
                          );
                        })}
                    </div>
                    <span className="comment-date">{formatDate(comment.created_at)}</span>
                    {comment.is_edited && <span className="comment-edited">(edited)</span>}
                  </div>

                  {comment.rating && (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <StarRating rating={comment.rating} size={14} disabled />
                    </div>
                  )}

                  {useRichText ? (
                    <div className="comment-content rich-text-comment">
                      <Suspense fallback={<div className="skeleton skeleton-text" style={{ width: "100%", height: 40 }} />}>
                        <ViewThread content={comment.content} />
                      </Suspense>
                    </div>
                  ) : (
                    <div className="comment-content">{comment.content}</div>
                  )}

                  <div className="comment-actions">
                    {currentUserId && onLike && (
                      <button
                        className={`action-btn like-btn${comment.is_liked ? " liked" : ""}`}
                        onClick={() => void onLike(comment)}
                        title={comment.is_liked ? "Unlike" : "Like"}
                        type="button"
                      >
                        <ThumbsUp size={14} fill={comment.is_liked ? "currentColor" : "none"} />
                        {comment.likes && comment.likes > 0 && <span>{comment.likes}</span>}
                      </button>
                    )}
                    {onDelete && comment.can_delete && (
                      <button
                        className="action-btn danger"
                        onClick={() => void onDelete(comment)}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </ContentFlatCard>
            );
          })
        )}
      </div>

      {lockedMessage && !canComment && (
        <div className="comment-locked-message">{lockedMessage}</div>
      )}

      {canComment && !userHasReviewed && (
        <div className="comment-composer">
          {enableRatings && (
            <div
              style={{
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Your Rating:
              </span>
              <StarRating
                rating={selectedRating}
                onChange={setSelectedRating}
                size={20}
                disabled={disabled}
              />
            </div>
          )}
          {useRichText ? (
            isEditorVisible ? (
              <div className="comment-editor-wrapper">
                <Suspense fallback={<div className="skeleton skeleton-text" style={{ width: "100%", height: 80 }} />}>
                  <Editor value={richTextContent} onChange={setRichTextContent} minHeight="80px" />
                </Suspense>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                  }}
                >
                  <button
                    className="action-btn btn-cancel"
                    style={{
                      padding: "6px 12px",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "4px",
                    }}
                    onClick={() => {
                      setIsEditorVisible(false);
                      setRichTextContent("");
                      setSelectedRating(0);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="action-btn btn-submit"
                    style={{
                      alignSelf: "flex-end",
                      padding: "6px 12px",
                      background: "var(--primary-color)",
                      color: "white",
                      borderRadius: "4px",
                    }}
                    disabled={
                      disabled ||
                      (enableRatings && selectedRating === 0) ||
                      (!enableRatings && (!richTextContent.trim() || richTextContent === "<p></p>"))
                    }
                    onClick={async () => {
                      if (disabled) return;
                      await onSubmit(richTextContent, enableRatings ? selectedRating : undefined);
                      setRichTextContent("");
                      setSelectedRating(0);
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
                <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>+</span> Make a reply
              </div>
            )
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <ComposerInput
                handleSend={async text => {
                  if (disabled) return;
                  if (enableRatings && selectedRating === 0) return;
                  await onSubmit(text, enableRatings ? selectedRating : undefined);
                  setSelectedRating(0);
                }}
                disabled={disabled || (enableRatings && selectedRating === 0)}
                placeholder={
                  enableRatings && selectedRating === 0 ? "Select a rating first..." : placeholder
                }
                minRows={1}
                maxRows={5}
              />
            </div>
          )}
        </div>
      )}
      {canComment && userHasReviewed && (
        <div
          className="comment-composer"
          style={{
            textAlign: "center",
            padding: "1rem",
            color: "var(--text-secondary)",
          }}
        >
          You have already reviewed this product.
        </div>
      )}
    </div>
  );
};

export default CommentSection;

import { Lock, Trash2, Unlock } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { User } from "../../atoms/auth";
import type { ForumCategory } from "../../atoms/forum";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { CategoryThreadsPreview } from "./CategoryThreadsPreview";
import { ForumPinnedIcon } from "./ForumPinnedIcon";

interface ForumCategoryCardProps {
  forum: ForumCategory;
  loading: boolean;
  currentUser: User | null;
  guestSandboxMode: boolean;
  canEditCategories: boolean;
  canDeleteCategory: boolean;
  navigate: NavigateFunction;
  onDeleteCategory: (categoryId: string) => void;
  onToggleCategoryLock: (categoryId: string, locked: boolean) => void;
  onToggleCategoryPin: (categoryId: string, pinned: boolean) => void;
  onDeleteThread: (threadId: string, categoryId: string) => void;
  onToggleThreadPin: (threadId: string, pinned: boolean) => void;
}

const displayCategoryName = (name: string) => (name.length > 20 ? `${name.slice(0, 15)}...` : name);

export function ForumCategoryCard({
  forum,
  loading,
  currentUser,
  guestSandboxMode,
  canEditCategories,
  canDeleteCategory,
  navigate,
  onDeleteCategory,
  onToggleCategoryLock,
  onToggleCategoryPin,
  onDeleteThread,
  onToggleThreadPin,
}: ForumCategoryCardProps) {
  const navigateToCategory = () => navigate(`/threads/categories/${forum.id}`);
  const handleKeyNavigate = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigateToCategory();
  };

  return (
    <ContentFlatCard
      role={loading ? undefined : "button"}
      tabIndex={loading ? undefined : 0}
      className="forum-category-card"
      onClick={loading ? undefined : navigateToCategory}
      onKeyDown={loading ? undefined : handleKeyNavigate}
      style={loading ? { cursor: "default" } : undefined}
    >
      <div className="forum-category-header">
        {loading ? (
          <div className="skeleton" style={{ width: "50%", height: 20, borderRadius: 4 }} />
        ) : (
          <h3 className="forum-category-title">
            {forum.is_pinned && (
              <span
                className="threads-feed-pinned-badge"
                title="Pinned"
                style={{
                  color: "var(--color-primary)",
                  marginRight: "8px",
                }}
              >
                <ForumPinnedIcon style={{ verticalAlign: "text-bottom" }} />
              </span>
            )}
            {forum.is_locked && <Lock size={14} className="category-lock-icon" />}
            {displayCategoryName(forum.name)}
          </h3>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {loading ? (
            <div className="skeleton" style={{ width: 40, height: 18, borderRadius: 999 }} />
          ) : (
            <>
              <span className="forum-threads-count">{forum.thread_count}</span>
              {canEditCategories && (
                <>
                  <button
                    type="button"
                    className={`action-btn pin-btn${forum.is_pinned ? " pinned" : ""}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleCategoryPin(forum.id, !forum.is_pinned);
                    }}
                    title={forum.is_pinned ? "Unpin category" : "Pin category"}
                    style={forum.is_pinned ? { color: "var(--color-primary)" } : {}}
                  >
                    <ForumPinnedIcon />
                  </button>
                  <button
                    type="button"
                    className={`action-btn lock-btn${forum.is_locked ? " locked" : ""}`}
                    onClick={e => {
                      e.stopPropagation();
                      onToggleCategoryLock(forum.id, !forum.is_locked);
                    }}
                    title={forum.is_locked ? "Unlock category" : "Lock category"}
                  >
                    {forum.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                  </button>
                </>
              )}
              {canDeleteCategory && (
                <button
                  type="button"
                  className="action-btn danger"
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteCategory(forum.id);
                  }}
                  title="Delete category"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div
          className="skeleton"
          style={{
            width: "95%",
            height: 12,
            borderRadius: 4,
            marginBottom: 16,
          }}
        />
      ) : (
        <p className="forum-category-description">{forum.description}</p>
      )}

      {loading ? (
        <div className="threads-list">
          <div className="skeleton" style={{ width: "100%", flex: 1, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: "100%", flex: 1, borderRadius: 8 }} />
        </div>
      ) : (forum.threads || []).length > 0 ? (
        <div className="threads-list">
          <CategoryThreadsPreview
            forum={forum}
            currentUser={currentUser}
            guestSandboxMode={guestSandboxMode}
            navigate={navigate}
            onDeleteThread={onDeleteThread}
            onToggleThreadPin={onToggleThreadPin}
          />
          <button
            type="button"
            className="threads-see-more"
            onClick={e => {
              e.stopPropagation();
              navigateToCategory();
            }}
          >
            See more in {forum.name} &rarr;
          </button>
        </div>
      ) : (
        <div className="empty-threads">No threads yet</div>
      )}
    </ContentFlatCard>
  );
}

import { useAtomValue } from "jotai";
import { ChevronDown, ChevronUp, MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Lock, Trash2, Unlock } from "lucide-react";
import { currentUserAtom } from "../../atoms/auth";
import { forumCategoriesAtom } from "../../atoms/forum";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import { useThreadsFeed } from "../../hooks/useThreadsFeed";
import { apiRequest } from "../../utils/api";
import { FilterBar } from "../ui/FilterBar";
import { confirmDestructiveAction } from "../ui/Prompt";
import CategoryThreadsFeed from "./CategoryThreadsFeed";
import { Forum } from "./Forum";

import "./CategoryThreadsPage.css";
import "./IconButton.css";

const CategoryThreadsPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const categories = useAtomValue(forumCategoriesAtom);
  const [forumExpanded, setForumExpanded] = useState(false);

  const category = categories.find(c => String(c.id) === String(categoryId));
  const currentUser = useAtomValue(currentUserAtom);
  const [guestSandboxMode] = useGuestSandboxMode();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { threads, isLoading, loading, feedRef, sentinelRef, handleScroll } = useThreadsFeed({
    categoryId,
    searchQuery: debouncedSearch,
  });

  const canDeleteCategory =
    currentUser?.permissions?.includes("forum.category-delete") || guestSandboxMode;
  const canEditCategories =
    currentUser?.permissions?.includes("forum.category-edit") ||
    currentUser?.roles?.includes("admin") ||
    guestSandboxMode;

  const handleDeleteCategory = async () => {
    if (!category) return;
    if (
      !(await confirmDestructiveAction({
        title: `Delete ${category.name}?`,
        body: "The category will move to Trash and its threads will be hidden.",
        confirmLabel: "Delete category",
      }))
    )
      return;
    try {
      await apiRequest(`/forum/categories/${category.id}`, {
        method: "DELETE",
      });
      navigate("/forum");
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  const handleToggleCategoryLock = async () => {
    if (!category) return;
    try {
      await apiRequest(`/forum/categories/${category.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_locked: !category.is_locked }),
      });
      // The websocket will sync the categories array
    } catch (error) {
      console.error("Error toggling category lock:", error);
    }
  };

  return (
    <>
      <div className="category-threads-page__toggle-row">
        <button
          className="action-btn category-threads-page__toggle"
          onClick={() => setForumExpanded(v => !v)}
          title={forumExpanded ? "Collapse forum" : "Expand forum"}
          aria-controls="category-threads-forum-directory"
          aria-expanded={forumExpanded}
        >
          {forumExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      <div
        id="category-threads-forum-directory"
        className={`category-threads-page__directory${forumExpanded ? " is-expanded" : ""}`}
        aria-hidden={!forumExpanded}
      >
        <Forum />
      </div>
      <div className="forum-container category-threads-page">
        <div className="forum-header category-threads-page__header">
          <div className="category-threads-page__header-left">
            <div className="category-threads-page__identity">
              <MessageSquare size={28} className="category-threads-page__identity-icon" />
              <div className="category-threads-page__identity-copy">
                <h1 className="category-threads-page__title">
                  {category?.name ?? `Category #${categoryId}`}
                </h1>
                {category?.description && (
                  <p className="category-threads-page__description">{category.description}</p>
                )}
              </div>
            </div>
          </div>
          <div className="category-threads-page__header-actions">
            <FilterBar
              compact
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search threads..."
              className="forum-search-field"
            >
              {canEditCategories && category && (
                <button
                  className={`action-btn lock-btn${category.is_locked ? " locked" : ""}`}
                  onClick={handleToggleCategoryLock}
                  title={category.is_locked ? "Unlock category" : "Lock category"}
                >
                  {category.is_locked ? <Unlock size={16} /> : <Lock size={16} />}
                </button>
              )}
              {canDeleteCategory && category && (
                <button
                  className="action-btn danger"
                  onClick={handleDeleteCategory}
                  title="Delete category"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                className="action-btn btn-close"
                onClick={() => navigate("/forum")}
                title="Back to Forum"
              >
                <X size={20} />
              </button>
            </FilterBar>
          </div>
        </div>

        <div className="forums-grid" style={{ display: "block" }}>
          <CategoryThreadsFeed
            threads={threads}
            isLoading={isLoading}
            loading={loading}
            feedRef={feedRef}
            sentinelRef={sentinelRef}
            handleScroll={handleScroll}
          />
        </div>
      </div>
    </>
  );
};

export default CategoryThreadsPage;

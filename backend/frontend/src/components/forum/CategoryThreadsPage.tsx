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
import SearchField from "../ui/SearchField";
import CategoryThreadsFeed from "./CategoryThreadsFeed";
import { Forum } from "./Forum";

import "./NewThread.css";

import "./IconButton.css";

const CategoryThreadsPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const categories = useAtomValue(forumCategoriesAtom);
  const [forumExpanded, setForumExpanded] = useState(true);

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

  // Show the forum briefly on mount, then retract so the transition is visible
  useEffect(() => {
    const t = setTimeout(() => setForumExpanded(false), 700);
    return () => clearTimeout(t);
  }, []);

  const canDeleteCategory =
    currentUser?.permissions?.includes("forum.category-delete") || guestSandboxMode;
  const canEditCategories =
    currentUser?.permissions?.includes("forum.category-edit") ||
    currentUser?.roles?.includes("admin") ||
    guestSandboxMode;

  const handleDeleteCategory = async () => {
    if (!category) return;
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
      {/* Toggle bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 10px",
        }}
      >
        <button
          onClick={() => setForumExpanded(v => !v)}
          title={forumExpanded ? "Collapse forum" : "Expand forum"}
          style={{
            borderRadius: "50%",
            aspectRatio: "1",
            padding: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "color 0.2s ease, background 0.2s ease",
          }}
        >
          {forumExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Collapsible Forum */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: forumExpanded ? "2000px" : "0px",
          transition: "max-height 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Forum />
      </div>
      <div className="forum-container" style={{ paddingTop: forumExpanded ? 0 : "40px" }}>
        {/* Header and Controls */}
        <div
          className="forum-header"
          style={{
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div className="forum-header-left" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <MessageSquare size={28} style={{ color: "var(--primary-color)", flexShrink: 0 }} />
              <div>
                <h1 style={{ margin: 0, fontSize: "2rem", color: "var(--text-primary)" }}>
                  {category?.name ?? `Category #${categoryId}`}
                </h1>
                {category?.description && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "var(--text-secondary)",
                      fontSize: "0.95rem",
                    }}
                  >
                    {category.description}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div
            className="forum-header-actions"
            style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}
          >
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search threads..."
              className="forum-search-field"
            />
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
          </div>
        </div>

        {/* Thread feed */}
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

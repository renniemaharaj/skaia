import { useNavigate, useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { X, MessageSquare, ChevronUp, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

import { forumCategoriesAtom } from "../../../atoms/forum";
import { useThreadsFeed } from "../../../hooks/useThreadsFeed";
import CategoryThreadsFeed from "./CategoryThreadsFeed";
import { Forum } from "../../../components/forum/Forum";

import "../../../components/forum/NewThread.css";
import "../../../components/forum/ThreadActions.css";
import "../../../components/forum/IconButton.css";

const CategoryThreadsPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const categories = useAtomValue(forumCategoriesAtom);
  const [forumExpanded, setForumExpanded] = useState(true);

  const category = categories.find((c) => String(c.id) === String(categoryId));
  const { threads, isLoading, loading, feedRef, sentinelRef, handleScroll } =
    useThreadsFeed({ categoryId });

  // Show the forum briefly on mount, then retract so the transition is visible
  useEffect(() => {
    const t = setTimeout(() => setForumExpanded(false), 700);
    return () => clearTimeout(t);
  }, []);

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
          onClick={() => setForumExpanded((v) => !v)}
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
      <div
        className="modal"
        style={{ width: "100vw", maxWidth: "100%", marginTop: "24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-wrapper">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <MessageSquare
                size={22}
                style={{ color: "var(--primary-color)", flexShrink: 0 }}
              />
              <div>
                <h2 style={{ margin: 0 }}>
                  {category?.name ?? `Category #${categoryId}`}
                </h2>
                {category?.description && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "var(--text-secondary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {category.description}
                  </p>
                )}
              </div>
            </div>
          </div>
          <button
            className="thread-action-btn btn-close"
            onClick={() => navigate("/forum")}
            title="Back to Forum"
          >
            <X size={20} />
          </button>
        </div>

        {/* Thread feed */}
        <div style={{ paddingTop: "8px" }}>
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

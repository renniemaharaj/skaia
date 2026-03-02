import { useNavigate, useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { X, MessageSquare } from "lucide-react";

import { forumCategoriesAtom } from "../../../atoms/forum";
import { useCategoryThreadsFeed } from "./useCategoryThreadsFeed";
import CategoryThreadsFeed from "./CategoryThreadsFeed";

import "../../users/UserProfile.css";
import "../../../components/NewThread.css";
import "../../../components/ThreadActions.css";
import "../../../components/IconButton.css";

const CategoryThreadsPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const categories = useAtomValue(forumCategoriesAtom);

  const category = categories.find((c) => String(c.id) === String(categoryId));

  const { threads, loading, sentinelRef } = useCategoryThreadsFeed(categoryId);

  return (
    <div
      className="modal"
      style={{ width: "100vw", maxWidth: "100%" }}
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
          loading={loading}
          sentinelRef={sentinelRef}
        />
      </div>
    </div>
  );
};

export default CategoryThreadsPage;

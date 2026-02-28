import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ThumbsUp, Pencil, Trash2, X } from "lucide-react";

import ViewThread from "../../components/ViewThread";
import ViewThreadMeta from "../../components/ViewThreadMeta";
import ViewThreadComments from "../../components/ViewThreadComments";
import Hero from "../../components/Hero";
import { welcomeMessage } from "../../components/welcome";

import "./index.css";
import "../../components/IconButton.css";
import "./../../components/EmptyState.css";

const ViewThreadPage = () => {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();

  const [isMobile, setIsMobile] = useState(
    window.matchMedia("(max-width: 880px)").matches,
  );

  const [, setReactions] = useState({
    like: 0,
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 880px)");
    const handler = () => setIsMobile(media.matches);

    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const handleLike = () => {
    setReactions((prev) => ({
      ...prev,
      like: prev.like + 1,
    }));

    // TODO: call backend reaction API
  };

  const handleEdit = () => {
    navigate(`/edit-thread/${threadId}`);
  };

  const handleDelete = async () => {
    const confirmDelete = confirm(
      "Are you sure you want to delete this thread?",
    );
    if (!confirmDelete) return;

    try {
      // TODO: call delete API
      navigate("/forum");
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div
      className={isMobile ? "mobile-view-thread-page" : "modal"}
      style={{ width: "100vw" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Hero height="350px" />

        {/* Header */}
        <div
          style={{
            marginTop: "1rem",
            marginBottom: "2rem",
            padding: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderLeft: "3px solid var(--primary-color)",
            // borderRight: "3px solid var(--primary-color)",
          }}
          // className="empty-state"
        >
          <h3 style={{ margin: 0 }}>
            Thread :: @{threadId} Welcome to the forum!
          </h3>

          <div style={{ display: "flex", gap: "1rem" }}>
            {/* Reaction */}
            <button
              className="thread-action-btn like-btn"
              onClick={handleLike}
              title="Like"
            >
              <ThumbsUp size={20} />
              {/* <span>{reactions.like}</span> */}
            </button>

            {/* Edit */}
            <button
              className="thread-action-btn edit-btn"
              onClick={handleEdit}
              title="Edit"
            >
              <Pencil size={14} />
            </button>

            {/* Delete */}
            <button
              className="thread-action-btn delete-btn"
              onClick={handleDelete}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>

            {/* Close */}
            <button
              className="thread-action-btn close-btn"
              onClick={() => navigate("/forum")}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="view-thread-page">
          <ViewThreadMeta threadId={threadId} />
          <ViewThread content={welcomeMessage} />
          <ViewThreadComments threadId={threadId} />
        </div>
      </div>
    </div>
  );
};

export default ViewThreadPage;

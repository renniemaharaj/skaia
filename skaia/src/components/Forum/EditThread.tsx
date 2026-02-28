import { CheckIcon, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "../Editor/Editor";
import "./EditThread.css";
import ForumCategory from "./ForumCategory";

const EditThread = () => {
  const threadFromUrl = useParams().threadId;
  const [editTitle, setEditTitle] = useState("Loading title...");
  const [editContent, setEditContent] = useState("Loading content...");
  const navigate = useNavigate();

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Edit Thread #{threadFromUrl}</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Update your discussion
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            className="thread-action-btn btn-close"
            onClick={() => navigate("/forum")}
            title="Close"
          >
            <X size={20} />
          </button>
          <button className="thread-action-btn btn-submit" title="Submit">
            <CheckIcon size={20} />
          </button>
        </div>
      </div>

      <div className="modal-form">
        <div className="form-group">
          <label htmlFor="edit-title">Thread Title</label>
          <input
            id="edit-title"
            type="text"
            placeholder="Update title..."
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <ForumCategory />
        </div>
        <div className="form-group">
          <label htmlFor="content">Message</label>
          <Editor value={editContent} onChange={setEditContent} />
        </div>
      </div>
    </div>
  );
};

export default EditThread;

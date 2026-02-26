import { X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ForumCategory from "./ForumCategory";
import Editor from "./Editor";

const EditThread = () => {
  // const editingThreadId = useParams().threadId;
  const threadFromUrl = useParams().threadId;
  //   const [editingThreadId, setEditingThreadId] = useState<string | null>(
  // threadFromUrl || null,
  //   );
  const [editTitle, setEditTitle] = useState("Loading title...");
  const [editContent, setEditContent] = useState("Loading content...");
  const navigate = useNavigate();

  return (
    // <div
    //   className={`modal-overlay ${editingThreadId ? "active" : ""}`}
    //   onClick={() => setEditingThreadId(null)}
    // >
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Edit Thread #{threadFromUrl}</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Update your discussion
          </p>
        </div>
        <button
          className="modal-close"
          onClick={() => navigate("/forum")}
          title="Close"
        >
          <X size={24} />
        </button>
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

        <div className="form-group">
          <button
            className="btn btn-primary"
            onClick={() => alert("Changes not saved in demo")}
            disabled={!editTitle.trim() || !editContent.trim()}
            style={{ width: "100%" }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
    // </div>
  );
};

export default EditThread;

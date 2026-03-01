import { useState } from "react";
import Editor from "./Editor";
import ForumCategory from "./ForumCategory";
import "./NewThread.css";
import { CheckIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./IconButton.css";
import "./ThreadActions.css";

const NewThread = ({}) => {
  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState("");
  const navigate = useNavigate();

  const handleCreateThread = () => {
    if (threadTitle.trim() && threadContent.trim()) {
      // Here you would typically send the new thread data to your backend API
      // For this example, we'll just log it to the console
      console.log("Creating thread with title:", threadTitle);
      console.log("Thread content:", threadContent);
    }
  };

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Create New Thread</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Start a discussion with the community
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {/* Close */}
          <button
            className="thread-action-btn btn-close"
            onClick={() => navigate("/forum")}
            title="Close"
          >
            <X size={20} />
          </button>
          <button
            className="thread-action-btn btn-submit"
            onClick={handleCreateThread}
            title="Submit"
          >
            <CheckIcon size={20} />
          </button>
        </div>
      </div>

      <div className="modal-form">
        <div className="form-group">
          <label htmlFor="title">Thread Title</label>
          <input
            id="title"
            type="text"
            placeholder="What's on your mind?"
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <ForumCategory />
        </div>
        <div className="form-group">
          <label htmlFor="content">Message</label>
          <Editor value={threadContent} onChange={setThreadContent} />
        </div>
      </div>
    </div>
  );
};

export default NewThread;

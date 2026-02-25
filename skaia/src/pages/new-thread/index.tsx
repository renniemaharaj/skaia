import { useState } from "react";
import Editor from "../../components/Editor";

const NewThreadPage = ({}) => {
  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState("");

  const handleCreateThread = () => {
    if (threadTitle.trim() && threadContent.trim()) {
      // Here you would typically send the new thread data to your backend API
      // For this example, we'll just log it to the console
      console.log("Creating thread with title:", threadTitle);
      console.log("Thread content:", threadContent);
    }
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Create New Thread</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Start a discussion with the community
          </p>
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
          <label htmlFor="content">Message</label>
          {/* <textarea
                id="content"
                placeholder="Write your message here..."
                value={threadContent}
                onChange={(e) => setThreadContent(e.target.value)}
              ></textarea> */}
          <Editor value={threadContent} onChange={setThreadContent} />
        </div>

        <div className="form-group">
          <button
            className="btn btn-primary"
            onClick={handleCreateThread}
            disabled={!threadTitle.trim() || !threadContent.trim()}
            style={{ width: "100%" }}
          >
            {/* <MessageCircle size={20} /> */}
            Post Thread
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewThreadPage;

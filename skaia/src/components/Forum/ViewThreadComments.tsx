import "./ViewThreadComments.css";
import { Send, ThumbsUp, Trash2 } from "lucide-react";

type Comment = {
  id: number;
  author: string;
  avatar: string;
  date: string;
  content: string;
};

const mockComments: Comment[] = [
  {
    id: 1,
    author: "Skaiacraft",
    avatar: "https://i.pravatar.cc/80?img=1",
    date: "June 10, 2024",
    content:
      "This is actually something I've been thinking about for a while. Looking forward to what comes next.",
  },
  {
    id: 2,
    author: "Rennie",
    avatar: "https://i.pravatar.cc/80?img=3",
    date: "June 11, 2024",
    content:
      "Interesting perspective. I agree, there's definitely potential here if it's executed properly.",
  },
];

const ViewThreadComments = ({ threadId }: { threadId: string | undefined }) => {
  return (
    <div className="view-thread-comments">
      <div className="comments-header">
        <h3>Comments for thread :: @{threadId}</h3>
        <span className="comments-count">{mockComments.length} Comments</span>
      </div>

      <div className="comments-list">
        {mockComments.map((comment) => (
          <div key={comment.id} className="comment-card">
            <div className="comment-avatar">
              <img src={comment.avatar} alt={comment.author} />
            </div>

            <div className="comment-body">
              <div className="comment-meta">
                <span className="comment-author">{comment.author}</span>
                <span className="comment-date">{comment.date}</span>
              </div>

              <div className="comment-content">{comment.content}</div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button className="thread-action-btn like-btn" title="Like">
                  <ThumbsUp size={20} />
                </button>

                <button className="thread-action-btn delete-btn" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="comment-form-wrapper">
        <form className="comment-form">
          <textarea
            className="richtext-outline-1"
            placeholder="Write a comment..."
            rows={4}
          />
          <div className="comment-form-actions">
            <button type="submit" className="comment-submit-btn">
              <Send size={16} />
              <span>Post Comment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ViewThreadComments;

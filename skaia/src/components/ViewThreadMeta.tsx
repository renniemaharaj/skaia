import { UserCog2Icon } from "lucide-react";
import "./ViewThreadMeta.css";

type Author = {
  name: string;
  profilePicture?: string;
  role?: string;
};

type ViewThreadMetaProps = {
  threadId?: string;
};

const ViewThreadMeta = ({ threadId }: ViewThreadMetaProps) => {
  const author: Author = {
    name: "John Doe",
    profilePicture: "",
    role: "Member",
  };
  return (
    <div className="richtext-outline-1 view-thread-meta-card">
      <div className="user-card">
        {author?.profilePicture ? (
          <img
            className="user-card-avatar"
            src={author?.profilePicture || "/default-avatar.png"}
            alt={author?.name || "User"}
          />
        ) : (
          <UserCog2Icon className="user-card-avatar" />
        )}

        <div className="user-card-info">
          <div className="user-card-name">{author?.name}</div>
          {author?.role && <div className="user-card-role">{author.role}</div>}
        </div>
      </div>

      <div className="thread-meta-id">Thread ID: {threadId}</div>
    </div>
  );
};

export default ViewThreadMeta;

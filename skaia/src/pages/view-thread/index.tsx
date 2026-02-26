import { useNavigate, useParams } from "react-router-dom";
import ViewThread from "../../components/ViewThread";
import ViewThreadMeta from "../../components/ViewThreadMeta";
import "./index.css";
import { X } from "lucide-react";

const ViewThreadPage = () => {
  const navigate = useNavigate();

  const threadId = useParams().threadId;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        style={{
          alignSelf: "end",
          marginRight: "2rem",
          marginTop: "1rem",
        }}
        className="modal-close"
        onClick={() => navigate("/forum")}
        title="Close"
      >
        <X size={24} />
      </button>
      <div className="view-thread-page">
        <ViewThreadMeta threadId={threadId} />
        <ViewThread
          content={"Fetching the content for thread ID: " + threadId}
        />
      </div>
    </div>
  );
};

export default ViewThreadPage;

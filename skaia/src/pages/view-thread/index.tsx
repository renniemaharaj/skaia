import { useNavigate, useParams } from "react-router-dom";
import ViewThread from "../../components/ViewThread";
import ViewThreadMeta from "../../components/ViewThreadMeta";
import "./index.css";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { welcomeMessage } from "../../components/welcome";

const ViewThreadPage = () => {
  const navigate = useNavigate();

  const [mediaQuery, setMediaQuery] = useState(
    window.matchMedia("(max-width: 600px)"),
  );
  const threadId = useParams().threadId;

  useEffect(() => {
    const handler = () =>
      setMediaQuery(window.matchMedia("(max-width: 600px)"));
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mediaQuery]);

  return (
    <div
      style={{ width: "100vw", height: "100vh" }}
      className={`${mediaQuery.matches ? "mobile-view-thread-page" : "modal"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            marginBottom: "2rem",
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-color)",
            marginTop: "1rem",
            padding: "0.5rem",
          }}
          className="richtext-outline-1"
        >
          <h3 style={{ marginBottom: 0 }}>Welcome to the forum</h3>
          <button
            style={{
              //   alignSelf: "end",
              marginRight: "1rem",
              //   marginTop: "1rem",
            }}
            className="modal-close"
            onClick={() => navigate("/forum")}
            title="Close"
          >
            <X size={24} />
          </button>
        </div>

        <div className="view-thread-page">
          <ViewThreadMeta threadId={threadId} />
          <ViewThread content={welcomeMessage} />
        </div>
      </div>
    </div>
  );
};

export default ViewThreadPage;

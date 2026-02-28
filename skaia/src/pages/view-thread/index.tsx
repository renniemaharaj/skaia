import { useNavigate, useParams } from "react-router-dom";
import ViewThread from "../../components/ViewThread";
import ViewThreadMeta from "../../components/ViewThreadMeta";
import "./index.css";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { welcomeMessage } from "../../components/welcome";
import Hero from "../../components/Hero";
import ViewThreadComments from "../../components/ViewThreadComments";

const ViewThreadPage = () => {
  const navigate = useNavigate();

  const [mediaQuery, setMediaQuery] = useState(
    window.matchMedia("(max-width: 880px)"),
  );
  const threadId = useParams().threadId;

  useEffect(() => {
    const handler = () =>
      setMediaQuery(window.matchMedia("(max-width: 880px)"));
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mediaQuery]);

  return (
    <div
      style={{ width: "100vw", maxHeight: "fit-content" }}
      className={`${mediaQuery.matches ? "mobile-view-thread-page" : "modal"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Hero height="300px" />
        <div
          style={{
            marginBottom: "2rem",
            display: "flex",
            justifyContent: "space-between",
            // backgroundColor: "var(--bg-color)",
            marginTop: "1rem",
            padding: "1rem",
            paddingLeft: "1rem",
            paddingRight: "1rem",
          }}
          // className="richtext-outline-1"
        >
          <h3 style={{ marginBottom: 0 }}>
            Welcome to the forum guys! thread:: {threadId}
          </h3>
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
          <ViewThreadComments threadId={threadId} />
        </div>
      </div>
    </div>
  );
};

export default ViewThreadPage;

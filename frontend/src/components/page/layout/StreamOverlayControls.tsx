import { useEffect, useState, useRef } from "react";
import UserAvatar from "../../user/UserAvatar";
import { Maximize, X } from "lucide-react";
import { relativeTimeAgo } from "../../../utils/serverTime";

interface StreamOverlayControlsProps {
  u: any;
  name: string;
  displayName: string;
  enlarged: any;
  setEnlargedStreamId: (id: string | null) => void;
}

export function StreamOverlayControls({
  u,
  name,
  displayName,
  enlarged,
  setEnlargedStreamId,
}: StreamOverlayControlsProps) {
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<number | null>(null);

  const resetTimer = () => {
    setVisible(true);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
    }, 3000);
  };

  useEffect(() => {
    resetTimer();
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      onMouseMove={resetTimer}
      onClick={resetTimer}
      onTouchStart={resetTimer}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          padding: "16px 12px 12px",
          background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}
        >
          <UserAvatar src={u?.avatar || undefined} alt={name} size={18} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
            {displayName}'s Stream
          </span>
          <span style={{ opacity: 0.8, fontSize: "0.9em", flexShrink: 0 }}>
            {relativeTimeAgo(enlarged.startedAt)}
          </span>
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="action-btn"
            title="Fullscreen"
            style={{
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
            }}
            onClick={e => {
              const container = e.currentTarget.closest(
                ".vp-stream-split-view, .up-upload-lightbox-content"
              );
              if (container) {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(console.error);
                } else {
                  container
                    .requestFullscreen()
                    .then(() => {
                      const orientation = window.screen?.orientation as any;
                      if (orientation?.lock) {
                        orientation.lock("landscape").catch(console.error);
                      }
                    })
                    .catch(console.error);
                }
              }
            }}
          >
            <Maximize size={16} />
          </button>
          <button
            type="button"
            className="action-btn"
            title="Close"
            style={{
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
            }}
            onClick={() => setEnlargedStreamId(null)}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

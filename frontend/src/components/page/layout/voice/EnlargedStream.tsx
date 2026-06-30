import { createPortal } from "react-dom";
import { VideoOff } from "lucide-react";
import Button from "../../../input/Button";
import { RemoteMedia } from "./RemoteMedia";
import { DraggablePiP } from "./DraggablePiP";
import { StreamOverlayControls } from "../StreamOverlayControls";

interface EnlargedStreamProps {
  enlargedStreamId: string | null;
  setEnlargedStreamId: (id: string | null) => void;
  isPanelExpanded: boolean;
  remoteStreams: any[];
  onlineUsers: any[];
  globalVolume: number;
}

export function EnlargedStream({
  enlargedStreamId,
  setEnlargedStreamId,
  isPanelExpanded,
  remoteStreams,
  onlineUsers,
  globalVolume,
}: EnlargedStreamProps) {
  if (!enlargedStreamId) return null;
  if (!isPanelExpanded) return null;

  const enlarged = remoteStreams.find(s => `${s.peerId}-${s.stream.id}` === enlargedStreamId);
  const hasActiveVideo =
    enlarged &&
    enlarged.stream.getVideoTracks().some((t: MediaStreamTrack) => t.readyState !== "ended");

  const isMobile =
    typeof window !== "undefined" && (window.innerWidth <= 720 || window.innerHeight <= 500);
  const isSplitMode = !isMobile;

  if (!enlarged || !hasActiveVideo) {
    if (isSplitMode) {
      return createPortal(
        <div
          className="vp-stream-split-view"
          style={{
            position: "fixed",
            top: 0,
            left: "var(--presence-panel-width, 440px)",
            width: "calc(100vw - var(--presence-panel-width, 440px))",
            height: "100vh",
            background: "transparent",
            zIndex: 2001,
            display: "flex",
            flexDirection: "column",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "#000",
              color: "#fff",
              gap: "16px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
            }}
          >
            <VideoOff size={48} opacity={0.5} />
            <div style={{ fontSize: "16px", fontWeight: 500 }}>Stream has ended</div>
            <Button onClick={() => setEnlargedStreamId(null)}>Close</Button>
          </div>
        </div>,
        document.body
      );
    }
    return null;
  }

  const u = onlineUsers.find(x => String(x.user_id) === enlarged.peerId);
  const name = u?.user_name || `User ${enlarged.peerId}`;
  const displayName = name.length > 7 ? name.substring(0, 7) + "..." : name;

  if (isSplitMode) {
    return createPortal(
      <div
        className="vp-stream-split-view"
        style={{
          position: "fixed",
          top: 0,
          left: "var(--presence-panel-width, 440px)",
          width: "calc(100vw - var(--presence-panel-width, 440px))",
          height: "100vh",
          background: "transparent",
          zIndex: 2001,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <RemoteMedia
            stream={enlarged.stream}
            volume={globalVolume}
            objectFit="contain"
            isModal={true}
          />
          {(() => {
            const otherStreams = remoteStreams.filter(
              s =>
                s.peerId === enlarged.peerId &&
                s.stream.id !== enlarged.stream.id &&
                s.stream.getVideoTracks().some((t: MediaStreamTrack) => t.readyState !== "ended")
            );
            if (otherStreams.length > 0) {
              return <DraggablePiP stream={otherStreams[0].stream} />;
            }
            return null;
          })()}
          <StreamOverlayControls
            u={u}
            name={name}
            displayName={displayName}
            enlarged={enlarged}
            setEnlargedStreamId={setEnlargedStreamId}
          />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <dialog
      open
      className="up-upload-lightbox media-preview-lightbox vp-stream-lightbox"
      onClick={() => setEnlargedStreamId(null)}
      onKeyDown={e => {
        if (e.key === "Escape") setEnlargedStreamId(null);
      }}
      aria-modal="true"
    >
      <div
        className="up-upload-lightbox-content"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="media-preview-frame" style={{ position: "relative" }}>
          <RemoteMedia
            stream={enlarged.stream}
            volume={globalVolume}
            objectFit="contain"
            isModal={true}
          />
          {(() => {
            const otherStreams = remoteStreams.filter(
              s =>
                s.peerId === enlarged.peerId &&
                s.stream.id !== enlarged.stream.id &&
                s.stream.getVideoTracks().some((t: MediaStreamTrack) => t.readyState !== "ended")
            );
            if (otherStreams.length > 0) {
              return <DraggablePiP stream={otherStreams[0].stream} />;
            }
            return null;
          })()}
          <StreamOverlayControls
            u={u}
            name={name}
            displayName={displayName}
            enlarged={enlarged}
            setEnlargedStreamId={setEnlargedStreamId}
          />
        </div>
      </div>
    </dialog>,
    document.body
  );
}

import React from "react";
import UserAvatar from "../../../user/UserAvatar";
import { relativeTimeAgo } from "../../../../utils/serverTime";
import { RemoteMedia } from "./RemoteMedia";

interface ActiveStreamsProps {
  streamsByPeer: Array<{
    peerId: string;
    startedAt: string;
    screen?: MediaStream;
    camera?: MediaStream;
    screenId?: string;
    cameraId?: string;
  }>;
  onlineUsers: Array<any>;
  setEnlargedStreamId: (id: string | null) => void;
  globalVolume: number;
}

export const ActiveStreams: React.FC<ActiveStreamsProps> = ({
  streamsByPeer,
  onlineUsers,
  setEnlargedStreamId,
  globalVolume,
}) => {
  if (streamsByPeer.length === 0) return null;

  return (
    <div
      className="vp-queue-list"
      style={{
        marginTop: "12px",
        borderTop: "1px solid var(--border-color)",
        paddingTop: "12px",
      }}
    >
      <div className="vp-queue-header">Active Streams</div>
      <div className="vp-queue-scroll">
        {streamsByPeer.map(({ peerId, screen, camera, startedAt, screenId, cameraId }) => {
          const u = onlineUsers.find(x => String(x.user_id) === peerId);
          const name = u?.user_name || `User ${peerId}`;
          const mainStream = screen || camera;
          const mainId = screenId || cameraId;
          if (!mainStream) return null;

          return (
            <div
              key={`${peerId}-${mainId}`}
              className="vp-queue-item"
              style={{
                flex: "0 0 160px",
                height: "90px",
                position: "relative",
              }}
              onClick={() => setEnlargedStreamId(`${peerId}-${mainId}`)}
            >
              <RemoteMedia stream={mainStream} volume={globalVolume} />
              {screen && camera && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "24px",
                    right: "4px",
                    width: "48px",
                    height: "36px",
                    borderRadius: "4px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.2)",
                    backgroundColor: "#000",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    zIndex: 2,
                  }}
                >
                  <RemoteMedia stream={camera} volume={0} objectFit="cover" />
                </div>
              )}
              <div
                className="vp-queue-item-info"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px",
                  paddingLeft: "6px",
                  fontSize: "10px",
                  bottom: 0,
                  zIndex: 3,
                }}
              >
                <UserAvatar src={u?.avatar || undefined} alt={name} size={16} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    flex: 1,
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "60px",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      fontSize: "9px",
                      color: "var(--text-secondary)",
                      opacity: 0.8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    • {relativeTimeAgo(startedAt)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

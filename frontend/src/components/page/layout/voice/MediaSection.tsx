import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  History as HistoryIcon,
  LayoutGrid,
  List,
  ListVideo,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { normalizeRoute } from "../../../../utils/route";
import { sendWebSocketMessage } from "../../../../utils/wsProtobuf";
import UserProfileOverlay from "../../../user/UserProfileOverlay";
import UserAvatar from "../../../user/UserAvatar";
import Button from "../../../input/Button";
import YouTubePlayer from "../YouTubePlayer";
import type { YouTubePlayerRef } from "../YouTubePlayer";

interface MediaSectionProps {
  mediaState: any;
  socket: WebSocket | null;
  location: { pathname: string };
  myPresenceId: number;
  currentUser: any;
  onlineUsers: any[];
  isPlayerMuted: boolean;
  hasManagePermission: boolean;
  playTransitionSound: () => void;
}

export const MediaSection: React.FC<MediaSectionProps> = ({
  mediaState,
  socket,
  location,
  myPresenceId,
  currentUser,
  onlineUsers,
  isPlayerMuted,
  hasManagePermission,
  playTransitionSound,
}) => {
  const [historyViewMode, setHistoryViewMode] = useState<"list" | "playlists">("list");
  const playerRef = useRef<YouTubePlayerRef>(null);

  const transitioningItemId = mediaState?.transitioning_item_id || null;
  const [transitionProgress, setTransitionProgress] = useState(0);
  const transitionPlayerRef = useRef<YouTubePlayerRef>(null);

  const transitioningItemIdRef = useRef<string | null>(null);
  const mediaStateRef = useRef(mediaState);
  mediaStateRef.current = mediaState;

  const completeTransition = useCallback(async () => {
    const id = transitioningItemIdRef.current;
    if (!id || !mediaStateRef.current?.queue[0]) return;

    playTransitionSound();

    let pos = 0;
    if (transitionPlayerRef.current) {
      pos = await transitionPlayerRef.current.getCurrentTime();
    }

    if (socket) {
      sendWebSocketMessage(socket, {
        type: "media:transition",
        payload: {
          route: normalizeRoute(location.pathname),
          item_id: mediaStateRef.current.queue[0].id,
          position: pos,
        },
      });
    }
    transitioningItemIdRef.current = null;
  }, [socket, location.pathname]);

  useEffect(() => {
    if (!transitioningItemId) {
      setTransitionProgress(0);
      return;
    }
    transitioningItemIdRef.current = transitioningItemId;

    const duration = 20000;
    const interval = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += interval;
      setTransitionProgress((elapsed / duration) * 100);
      if (elapsed >= duration) {
        clearInterval(timer);
        completeTransition();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [transitioningItemId, completeTransition]);

  const [currentProgress, setCurrentProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sessionPlayTime, setSessionPlayTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (playerRef.current && mediaState?.queue?.length) {
        const time = await playerRef.current.getCurrentTime();
        const dur = await playerRef.current.getDuration();
        setCurrentProgress(time);
        setDuration(dur);
        if (!mediaState.is_paused) {
          setSessionPlayTime(p => p + 1);
        }
      } else {
        setCurrentProgress(0);
        setDuration(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [mediaState?.queue?.length, mediaState?.is_paused]);

  const formatTime = (secs: number) => {
    if (!secs || Number.isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const [inputUrl, setInputUrl] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; title: string; thumbnail: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  const extractYouTubeId = (url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
      if (u.hostname === "youtu.be") return u.pathname.slice(1);
    } catch {
      return url.length === 11 ? url : null;
    }
    return null;
  };

  useEffect(() => {
    const isUrl = extractYouTubeId(inputUrl);
    if (!inputUrl || isUrl) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const instances = [
        "https://api.piped.private.coffee",
        "https://pipedapi.smnz.de",
        "https://pipedapi.kavin.rocks",
      ];
      let success = false;

      for (const instance of instances) {
        try {
          const res = await fetch(
            `${instance}/search?q=${encodeURIComponent(inputUrl)}&filter=videos`
          );
          if (res.ok) {
            const data = await res.json();
            setSearchResults(
              data.items.slice(0, 5).map((item: any) => ({
                id: item.url.split("?v=")[1] || item.url.split("/watch?v=")[1],
                title: item.title,
                thumbnail: item.thumbnail,
              }))
            );
            success = true;
            break;
          }
        } catch {
          // Try next instance
        }
      }

      if (!success) {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [inputUrl]);

  const handleAddMedia = (e?: React.FormEvent) => {
    e?.preventDefault();
    const vid = extractYouTubeId(inputUrl);
    if (!vid) {
      if (searchResults.length > 0) {
        if (socket) {
          sendWebSocketMessage(socket, {
            type: "media:add",
            payload: {
              route: normalizeRoute(location.pathname),
              video_id: searchResults[0].id,
              loop: false,
            },
          });
        }
        setInputUrl("");
        setSearchResults([]);
      } else {
        toast.error("Invalid YouTube URL");
      }
      return;
    }
    if (socket) {
      sendWebSocketMessage(socket, {
        type: "media:add",
        payload: { route: normalizeRoute(location.pathname), video_id: vid, loop: false },
      });
    }
    setInputUrl("");
    setSearchResults([]);
  };

  const handleRemoveMedia = (itemId: string) => {
    if (socket) {
      sendWebSocketMessage(socket, {
        type: "media:remove",
        payload: { route: normalizeRoute(location.pathname), item_id: itemId },
      });
    }
  };

  const handleClearHistory = () => {
    if (socket) {
      sendWebSocketMessage(socket, {
        type: "media:history:clear",
        payload: { route: normalizeRoute(location.pathname) },
      });
    }
  };

  const handlePauseToggle = async () => {
    let position = 0;
    if (playerRef.current) {
      position = await playerRef.current.getCurrentTime();
    }
    if (socket) {
      sendWebSocketMessage(socket, {
        type: "media:action",
        payload: { route: normalizeRoute(location.pathname), position },
      });
    }
  };

  const [retiredItems, setRetiredItems] = useState<any[]>([]);
  const prevQueueRef = useRef(mediaState?.queue || []);

  useEffect(() => {
    if (!mediaState?.queue) return;
    const currentIds = new Set(mediaState.queue.map((i: any) => i.id));
    const removed = prevQueueRef.current.filter(
      (i: any) => !currentIds.has(i.id) && i.id !== transitioningItemId
    );

    if (removed.length > 0) {
      setRetiredItems(prev => [...prev, ...removed.map((r: any) => ({ ...r, _retired: true }))]);
      setTimeout(() => {
        setRetiredItems(prev => prev.filter((i: any) => !removed.find((r: any) => r.id === i.id)));
      }, 5000);
    }
    prevQueueRef.current = mediaState.queue;
  }, [mediaState?.queue, transitioningItemId]);

  const handleEnded = useCallback(() => {
    if (mediaState?.queue && mediaState.queue.length > 0) {
      if (socket) {
        sendWebSocketMessage(socket, {
          type: "media:ended",
          payload: {
            route: normalizeRoute(location.pathname),
            item_id: mediaState.queue[0].id,
          },
        });
      }
    }
  }, [mediaState, socket, location.pathname]);

  return (
    <div className="vp-media-section ui-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <h4>Media Queue</h4>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {(() => {
            const unmutedUsers = onlineUsers.filter(
              u =>
                normalizeRoute(u.route) === normalizeRoute(location.pathname) &&
                u.is_muted === false
            );
            const showLocal = !isPlayerMuted;
            const totalUnmuted = new Set(unmutedUsers.map(u => String(u.user_id)));
            if (showLocal && myPresenceId) totalUnmuted.add(String(myPresenceId));

            if (totalUnmuted.size > 0) {
              return (
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    marginRight: "8px",
                  }}
                >
                  {Array.from(totalUnmuted).map(uid => {
                    let user;
                    if (uid === String(myPresenceId) && currentUser) {
                      user = {
                        user_name: currentUser.display_name || currentUser.username,
                        avatar: currentUser.avatar_url,
                      };
                    } else {
                      user = onlineUsers.find(u => String(u.user_id) === uid);
                    }
                    if (!user) return null;
                    return (
                      <UserProfileOverlay
                        key={`unmute-${uid}`}
                        userId={uid}
                        fallbackName={user.user_name}
                        fallbackAvatar={user.avatar || undefined}
                      >
                        <div style={{ display: "flex" }}>
                          <UserAvatar
                            src={user.avatar || undefined}
                            alt={user.user_name}
                            size={20}
                          />
                        </div>
                      </UserProfileOverlay>
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}

          {hasManagePermission && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
              onClick={handlePauseToggle}
            >
              {mediaState?.is_paused ? <Play size={12} /> : <Pause size={12} />}
              {mediaState?.is_paused ? " Resume" : " Pause"}
            </button>
          )}
        </div>
      </div>

      <form className="vp-media-input compact-form-card" onSubmit={handleAddMedia}>
        <input
          type="text"
          placeholder="Search or YouTube URL..."
          aria-label="Search for media or paste a YouTube URL"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={isSearching}
          disabled={!inputUrl || isSearching}
          aria-label="Add media"
        >
          Search
        </Button>
      </form>

      {searchResults.length > 0 && (
        <div className="vp-search-results">
          {searchResults.map(res => (
            <div
              key={res.id}
              className="vp-search-result-item"
              onClick={() => {
                if (socket) {
                  sendWebSocketMessage(socket, {
                    type: "media:add",
                    payload: {
                      route: normalizeRoute(location.pathname),
                      video_id: res.id,
                      loop: false,
                    },
                  });
                }
                setInputUrl("");
                setSearchResults([]);
              }}
            >
              <img src={res.thumbnail} alt="" />
              <span>{res.title}</span>
            </div>
          ))}
        </div>
      )}

      {mediaState?.queue && mediaState.queue.length > 0 && (
        <>
          <div className="vp-media-stats">
            <div>
              <span className="vp-text-secondary">Prog:</span> {formatTime(currentProgress)}
            </div>
            <div>
              <span className="vp-text-secondary">Left:</span>{" "}
              {formatTime(Math.max(0, duration - currentProgress))}
            </div>
            <div>
              <span className="vp-text-secondary">Session:</span> {formatTime(sessionPlayTime)}
            </div>
          </div>

          <div className="vp-active-player" style={{ display: "flex", gap: "8px" }}>
            {mediaState.queue
              .filter((item: any, idx: number) => idx === 0 || item.id === transitioningItemId)
              .concat(retiredItems)
              .map((item: any, idx: number) => {
                const isRetired = item._retired;
                const isPrimary = !isRetired && idx === 0;
                return (
                  <div
                    key={`${item.id}${isPrimary ? "-primary" : ""}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: "100%",
                      display: isRetired ? "none" : "block",
                    }}
                  >
                    <YouTubePlayer
                      ref={isPrimary ? playerRef : !isRetired ? transitionPlayerRef : null}
                      videoId={item.video_id}
                      isPaused={isPrimary ? mediaState.is_paused : !!isRetired}
                      isMuted={isPlayerMuted}
                      currentPosition={isPrimary ? mediaState.current_position || 0 : 0}
                      updatedAt={isPrimary ? mediaState.updated_at || "" : new Date().toISOString()}
                      onEnded={isPrimary ? handleEnded : () => {}}
                    />
                  </div>
                );
              })}
          </div>

          {mediaState.queue.length > 1 && (
            <div className="vp-queue-list">
              <div className="vp-queue-header">
                <ListVideo size={12} /> Up Next
              </div>
              <div className="vp-queue-scroll">
                {mediaState.queue.slice(1).map((item: any, index: number) => (
                  <div key={item.id} className="vp-queue-item">
                    <img
                      src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`}
                      alt="Thumbnail"
                    />
                    <div className="vp-queue-item-overlay">
                      {index === 0 &&
                        (transitioningItemId === item.id ? (
                          <button
                            onClick={completeTransition}
                            className="action-btn"
                            style={{
                              position: "relative",
                              marginRight: "4px",
                            }}
                            title="Complete transition immediately"
                          >
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              style={{ transform: "rotate(-90deg)" }}
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth="2"
                                fill="none"
                              />
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="#fff"
                                strokeWidth="2"
                                fill="none"
                                strokeDasharray="62.8"
                                strokeDashoffset={62.8 - (62.8 * transitionProgress) / 100}
                              />
                            </svg>
                            <span
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                fontSize: "10px",
                                fontWeight: "bold",
                              }}
                            >
                              {Math.ceil(20 - (transitionProgress / 100) * 20)}
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (socket) {
                                sendWebSocketMessage(socket, {
                                  type: "media:transition:start",
                                  payload: {
                                    route: normalizeRoute(location.pathname),
                                    item_id: item.id,
                                  },
                                });
                              }
                            }}
                            className="action-btn"
                            style={{
                              marginRight: "4px",
                            }}
                            title="Start transition"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M16 3h5v5" />
                              <path d="M4 20L21 3" />
                              <path d="M21 16v5h-5" />
                              <path d="M15 15l6 6" />
                              <path d="M4 4l5 5" />
                            </svg>
                          </button>
                        ))}

                      {index === 0 && transitioningItemId !== item.id && (
                        <button
                          onClick={() => {
                            if (socket) {
                              sendWebSocketMessage(socket, {
                                type: "media:transition",
                                payload: {
                                  route: normalizeRoute(location.pathname),
                                  item_id: mediaState.queue[0].id,
                                  position: 0,
                                },
                              });
                            }
                          }}
                          className="action-btn"
                          style={{
                            marginRight: "4px",
                          }}
                          title="Play Now"
                        >
                          <Play size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveMedia(item.id)}
                        className="action-btn danger"
                        title="Remove from queue"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {mediaState?.history && mediaState.history.length > 0 && (
        <div className="vp-queue-list">
          <div
            className="vp-queue-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <HistoryIcon size={12} /> History
            </span>
            <div className="directory-layout__view-toggle">
              <button
                className={`directory-view-btn ${historyViewMode === "list" ? "active" : ""}`}
                onClick={() => setHistoryViewMode("list")}
                title="List View"
              >
                <List size={14} />
              </button>
              <button
                className={`directory-view-btn ${historyViewMode === "playlists" ? "active" : ""}`}
                onClick={() => setHistoryViewMode("playlists")}
                title="Playlist View"
              >
                <LayoutGrid size={14} />
              </button>
              {hasManagePermission && (
                <button
                  className="directory-view-btn danger"
                  onClick={handleClearHistory}
                  title="Clear history"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {historyViewMode === "playlists" &&
          mediaState.playlists &&
          mediaState.playlists.length > 0 ? (
            <div className="vp-playlists-container" style={{ marginTop: "8px" }}>
              {mediaState.playlists.map((playlist: any) => (
                <div key={playlist.id} className="vp-playlist-card">
                  <div className="vp-playlist-header">
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Calendar size={10} />
                      {new Date(playlist.start_time).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{playlist.items.length} items</span>
                  </div>
                  <div className="vp-playlist-items">
                    {playlist.items.map((item: any) => (
                      <img
                        key={item.id}
                        src={`https://img.youtube.com/vi/${item.video_id}/default.jpg`}
                        title={`${item.user_name} - ${new Date(item.created_at).toLocaleTimeString()}`}
                        onClick={() => {
                          if (socket) {
                            sendWebSocketMessage(socket, {
                              type: "media:add",
                              payload: {
                                route: normalizeRoute(location.pathname),
                                video_id: item.video_id,
                                loop: false,
                              },
                            });
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="vp-queue-scroll" style={{ marginTop: "8px" }}>
              {mediaState.history.map((item: any) => (
                <div key={item.id} className="vp-queue-item">
                  <img
                    src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`}
                    alt="Thumbnail"
                  />
                  <div className="vp-queue-item-info">
                    <span>
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="vp-queue-item-overlay">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (socket) {
                          sendWebSocketMessage(socket, {
                            type: "media:remove",
                            payload: {
                              route: normalizeRoute(location.pathname),
                              item_id: item.id,
                            },
                          });
                        }
                      }}
                      className="action-btn danger"
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                      }}
                      title="Remove from history"
                    >
                      <X size={10} />
                    </button>
                    <button
                      onClick={() => {
                        if (socket) {
                          sendWebSocketMessage(socket, {
                            type: "media:add",
                            payload: {
                              route: normalizeRoute(location.pathname),
                              video_id: item.video_id,
                              loop: false,
                            },
                          });
                        }
                      }}
                      className="action-btn"
                      title="Play Again"
                    >
                      <Play size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

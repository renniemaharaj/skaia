import { useAtom, useAtomValue } from "jotai";
import {
  Mic,
  MicOff,
  Settings,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  MonitorUp,
  Save,
  Radio,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import AdminSettings from "./voice/AdminSettings";
import { currentUserAtom, hasPermissionAtom, socketAtom } from "../../../atoms/auth";
import { mediaStateAtom, playerMutedAtom } from "../../../atoms/media";
import { onlineUsersAtom, presencePanelExpandedAtom } from "../../../atoms/presence";
import {
  enlargedStreamIdAtom,
  streamRoutePlaybackAtom,
  voicePermissionsAtom,
  useV2RTCAtom,
} from "../../../atoms/voice";
import { getGuestSessionId } from "../../../utils/guestSession";
import { getSoundVolume } from "../../../utils/sound";
import { sendWebSocketMessage } from "../../../utils/wsProtobuf";

import Select from "../../input/Select";
import UserAvatar from "../../user/UserAvatar";
import UserProfileOverlay from "../../user/UserProfileOverlay";
import "../../ui/MediaPreviewLightbox.css";
import "./VoicePanel.css";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { normalizeRoute } from "../../../utils/route";
import { ActiveStreams } from "./voice/ActiveStreams";
import { MediaSection } from "./voice/MediaSection";
import { EnlargedStream } from "./voice/EnlargedStream";
import StreamMetaEditor from "./voice/StreamMetaEditor";

import { useMediaDevices } from "./voice/useMediaDevices";
import { useLocalRecording } from "./voice/useLocalRecording";

import { useWebRTCManager } from "../../../lib/webrtc/useWebRTCManager";
import { type VoiceSignalPayload } from "../../../lib/webrtc/WebRTCManager";
import { apiRequest } from "../../../utils/api";

interface WebRTCPanelProps {
  mediaOnly?: boolean;
  voiceOnly?: boolean;
}

export default function WebRTCPanel({
  mediaOnly = false,
  voiceOnly = false,
}: WebRTCPanelProps = {}) {
  const [globalVolume, setGlobalVolume] = useState(() => getSoundVolume());
  const globalVolumeRef = useRef(globalVolume);
  globalVolumeRef.current = globalVolume;
  const [isPlayerMuted, setIsPlayerMuted] = useAtom(playerMutedAtom);
  const isPlayerMutedRef = useRef(isPlayerMuted);
  isPlayerMutedRef.current = isPlayerMuted;
  const [useV2RTC, setUseV2RTC] = useAtom(useV2RTCAtom);
  const [recordLocally, setRecordLocally] = useState(false);

  useEffect(() => {
    const handleVolumeChange = (e: Event) => {
      setGlobalVolume((e as CustomEvent<number>).detail);
    };
    window.addEventListener("sound:volume-change", handleVolumeChange);
    return () => window.removeEventListener("sound:volume-change", handleVolumeChange);
  }, []);

  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const onlineUsers = useAtomValue(onlineUsersAtom);
  const hasManagePermission = useAtomValue(hasPermissionAtom)("home.manage");
  const mediaState = useAtomValue(mediaStateAtom);
  const location = useLocation();
  const navigate = useNavigate();

  const [enlargedStreamId, setEnlargedStreamId] = useAtom(enlargedStreamIdAtom);
  const [, setStreamRoutePlayback] = useAtom(streamRoutePlaybackAtom);
  const [isPanelExpanded, setIsPanelExpanded] = useAtom(presencePanelExpandedAtom);
  const [searchParams, setSearchParams] = useSearchParams();
  const hasAutoOpenedStreamRef = useRef<string | null>(null);

  const [permissions, setPermissions] = useAtom(voicePermissionsAtom);
  const streamRouteId = useMemo(() => {
    const match = location.pathname.match(/^\/stream\/([^/?#]+)$/);
    return match?.[1] || "";
  }, [location.pathname]);
  const canManageVoice = hasManagePermission || permissions.canManage;

  useEffect(() => {
    const route = normalizeRoute(location.pathname);
    apiRequest<any>(`/api/voice/permissions?route=${encodeURIComponent(route)}`)
      .then((data: any) => {
        if (data && data.route === route) {
          setPermissions(prev => ({ ...prev, ...data }));
        }
      })
      .catch(console.error);
  }, [location.pathname, setPermissions]);

  useEffect(() => {
    const sid = searchParams.get("streamId");
    if (sid && enlargedStreamId !== sid) {
      setEnlargedStreamId(sid);
      if (!isPanelExpanded) setIsPanelExpanded(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (enlargedStreamId) {
      if (searchParams.get("streamId") !== enlargedStreamId) {
        const newParams = new URLSearchParams(searchParams);
        newParams.set("streamId", enlargedStreamId);
        setSearchParams(newParams, { replace: true });
      }
    } else {
      if (searchParams.has("streamId")) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("streamId");
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [enlargedStreamId, searchParams, setSearchParams]);

  useEffect(() => {
    const activeVideoId = mediaState?.queue?.[0]?.video_id;
    if (activeVideoId) {
      if (searchParams.get("v") !== activeVideoId) {
        const newParams = new URLSearchParams(searchParams);
        newParams.set("v", activeVideoId);
        setSearchParams(newParams, { replace: true });
      }
    } else if (mediaState?.queue && searchParams.has("v")) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("v");
      setSearchParams(newParams, { replace: true });
    }
  }, [mediaState?.queue, searchParams, setSearchParams]);

  const [activeSpeakers, setActiveSpeakers] = useState<Record<string, number>>({});

  useEffect(() => {
    const handleSpeaking = (e: any) => {
      const senderID = String(e.detail);
      setActiveSpeakers(prev => ({ ...prev, [senderID]: Date.now() }));
    };
    window.addEventListener("voice:speaking", handleSpeaking);
    return () => window.removeEventListener("voice:speaking", handleSpeaking);
  }, []);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(timer);
  }, []);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const ensureAudioGraph = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = globalVolume;
      gainNode.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      gainNodeRef.current = gainNode;
    }

    return {
      audioContext: audioContextRef.current,
      gainNode: gainNodeRef.current,
    };
  }, [globalVolume]);

  const playSoundEffect = useCallback(
    (type: "swoosh" | "ding" | "boop" | "chime") => {
      if (isPlayerMuted) return;
      try {
        const { audioContext, gainNode } = ensureAudioGraph();
        if (!audioContext || !gainNode) return;
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        const t = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const soundGain = audioContext.createGain();

        osc.connect(soundGain);
        soundGain.connect(gainNode);

        if (type === "swoosh") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
          soundGain.gain.setValueAtTime(0, t);
          soundGain.gain.linearRampToValueAtTime(0.5, t + 0.05);
          soundGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
          osc.start(t);
          osc.stop(t + 0.3);
        } else if (type === "ding") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(1200, t);
          soundGain.gain.setValueAtTime(0, t);
          soundGain.gain.linearRampToValueAtTime(0.3, t + 0.02);
          soundGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
          osc.start(t);
          osc.stop(t + 0.5);
        } else if (type === "boop") {
          osc.type = "square";
          osc.frequency.setValueAtTime(300, t);
          soundGain.gain.setValueAtTime(0, t);
          soundGain.gain.linearRampToValueAtTime(0.2, t + 0.02);
          soundGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
          osc.start(t);
          osc.stop(t + 0.2);
        } else if (type === "chime") {
          osc.type = "triangle";
          osc.frequency.setValueAtTime(600, t);
          osc.frequency.setValueAtTime(800, t + 0.1);
          osc.frequency.setValueAtTime(1000, t + 0.2);
          soundGain.gain.setValueAtTime(0, t);
          soundGain.gain.linearRampToValueAtTime(0.3, t + 0.05);
          soundGain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
          osc.start(t);
          osc.stop(t + 1.0);
        }
      } catch (e) {
        // Ignore audio errors if context cannot be created/resumed
      }
    },
    [ensureAudioGraph, isPlayerMuted]
  );

  const playTransitionSound = useCallback(() => playSoundEffect("swoosh"), [playSoundEffect]);

  const isMutedByAdmin = currentUser && permissions.mutedUsers[Number(currentUser.id)];
  const isKicked = currentUser && permissions.kickedUsers[Number(currentUser.id)];

  const canSpeak = permissions.voiceEnabled && !isMutedByAdmin && !isKicked;
  const myPresenceId =
    currentUser?.id != null
      ? Number(currentUser.id)
      : (onlineUsers.find(user => user.guest_session_id === getGuestSessionId())?.user_id ?? 0);

  const sendVoiceSignal = useCallback(
    (targetUserId: number, payload: Omit<VoiceSignalPayload, "route" | "target_user_id">) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn(
          `[VoicePanel] Dropping signal ${payload.kind} to ${targetUserId} because socket is not open at ${Date.now()}`
        );
        return;
      }
      console.log(
        `[VoicePanel] Sending signal ${payload.kind} to ${targetUserId} at ${Date.now()}`
      );
      sendWebSocketMessage(socket, {
        type: "voice:signal",
        payload: {
          route: normalizeRoute(location.pathname),
          target_user_id: targetUserId,
          ...payload,
        },
      });
    },
    [socket, location.pathname]
  );

  const getLocalStreams = useCallback(() => {
    return [streamRef.current, cameraStreamRef.current, screenStreamRef.current].filter(
      Boolean
    ) as MediaStream[];
  }, []);

  const {
    remoteStreams,
    remoteMicUsers,
    handleSignal,
    ensureConnection,
    closePeer,
    broadcastTracks,
    removeTracks,
    getActivePeerIds,
    syncActivePeers,
    autoplayBlocked,
    setAutoplayBlocked,
    peerConnectionStates,
  } = useWebRTCManager(
    Number(myPresenceId),
    sendVoiceSignal,
    globalVolume,
    isPlayerMuted,
    getLocalStreams
  );

  // When guests are disabled, disconnect all existing guest peer connections
  useEffect(() => {
    if (!permissions.guestsAllowed) {
      getActivePeerIds().forEach(peerId => {
        // Guests have negative user IDs
        if (Number(peerId) < 0) {
          console.log(
            `[WebRTCPanel] Dropping guest peer ${peerId} because guests are no longer allowed`
          );
          closePeer(peerId);
        }
      });
    }
  }, [permissions.guestsAllowed, getActivePeerIds, closePeer]);

  const {
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    micActive,
    cameraActive,
    screenActive,
    streamRef,
    cameraStreamRef,
    screenStreamRef,
    toggleMic,
    toggleCamera,
    toggleScreen,
    handleAudioDeviceChange,
    handleVideoDeviceChange,
  } = useMediaDevices({
    canSpeak,
    ensureAudioGraph,
    broadcastTracks,
    removeTracks,
  });
  const streamMetaPreviewStream = screenActive
    ? screenStreamRef.current
    : cameraActive
      ? cameraStreamRef.current
      : null;

  useLocalRecording(
    recordLocally && screenActive,
    screenStreamRef.current,
    streamRef.current,
    cameraStreamRef.current,
    remoteStreams
  );

  useEffect(() => {
    if (!screenActive && recordLocally) {
      setRecordLocally(false);
    }
  }, [screenActive, recordLocally]);

  useEffect(() => {
    if (autoplayBlocked) {
      toast("Browser blocked audio autoplay. Please interact with the page.", {
        icon: "🔇",
        duration: 5000,
      });
      setAutoplayBlocked(false);
    }
  }, [autoplayBlocked, setAutoplayBlocked]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && window.screen?.orientation?.unlock) {
        window.screen.orientation.unlock();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = globalVolume;
    }
    const audioContext = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (audioContext && gainNode) {
      gainNode.gain.setTargetAtTime(globalVolume, audioContext.currentTime, 0.03);
    }
  }, [globalVolume, isPlayerMuted]);

  useEffect(() => {
    const onVoiceSignal = async (event: Event) => {
      const signal = (event as CustomEvent<VoiceSignalPayload>).detail;
      const peerId = signal.sender_user_id;
      if (
        !peerId ||
        normalizeRoute(signal.route) !== normalizeRoute(location.pathname) ||
        signal.target_user_id !== myPresenceId
      ) {
        return;
      }
      if (signal.kind === "leave") {
        closePeer(String(peerId), false);
        return;
      }
      await handleSignal(peerId, signal);
    };

    window.addEventListener("voice:signal", onVoiceSignal);
    return () => {
      window.removeEventListener("voice:signal", onVoiceSignal);
    };
  }, [closePeer, handleSignal, location.pathname, myPresenceId]);

  useEffect(() => {
    if (!myPresenceId) return;

    const validUserIds = new Set<string>();

    const peers = getActivePeerIds();
    for (const user of onlineUsers) {
      if (
        normalizeRoute(user.route) !== normalizeRoute(location.pathname) ||
        user.user_id === myPresenceId
      )
        continue;
      if (!permissions.guestsAllowed && user.user_id < 0) continue;
      validUserIds.add(String(user.user_id));

      if (!peers.includes(String(user.user_id))) {
        ensureConnection(user.user_id, true, [
          streamRef.current,
          cameraStreamRef.current,
          screenStreamRef.current,
        ]);
      }
    }
  }, [
    location.pathname,
    myPresenceId,
    onlineUsers,
    socket,
    sendVoiceSignal,
    ensureConnection,
    getActivePeerIds,
    permissions.guestsAllowed,
  ]);

  const validUserIdsRef = useRef(new Set<string>());
  useEffect(() => {
    validUserIdsRef.current = new Set(
      onlineUsers
        .filter(u => {
          if (normalizeRoute(u.route) !== normalizeRoute(location.pathname)) return false;
          if (u.user_id === myPresenceId) return false;
          if (!permissions.guestsAllowed && u.user_id < 0) return false;
          return true;
        })
        .map(u => String(u.user_id))
    );
  }, [onlineUsers, location.pathname, myPresenceId, permissions.guestsAllowed]);

  useEffect(() => {
    const timer = setInterval(() => {
      syncActivePeers(Array.from(validUserIdsRef.current), [
        streamRef.current,
        cameraStreamRef.current,
        screenStreamRef.current,
      ]);
    }, 1000);
    return () => clearInterval(timer);
  }, [syncActivePeers]);

  const activeMicUserIds = new Set<string>(remoteMicUsers);
  const activeCameraUserIds = new Set<string>();
  const activeScreenUserIds = new Set<string>();

  if (micActive && myPresenceId) activeMicUserIds.add(String(myPresenceId));
  if (cameraActive && myPresenceId) activeCameraUserIds.add(String(myPresenceId));
  if (screenActive && myPresenceId) activeScreenUserIds.add(String(myPresenceId));

  const streamsByPeer = useMemo(() => {
    const map = new Map<
      string,
      {
        screen?: MediaStream;
        camera?: MediaStream;
        startedAt: string;
        screenId?: string;
        cameraId?: string;
      }
    >();
    remoteStreams.forEach(({ peerId, stream, startedAt }) => {
      // Ignore audio-only streams from being listed as active video streams
      const videoTracks = stream.getVideoTracks().filter(t => t.readyState !== "ended");
      if (videoTracks.length === 0) return;

      // Best-effort detection for screen sharing vs camera
      const isScreen = videoTracks.some(t => {
        const s = t.getSettings() as any;
        return s.displaySurface || s.cursor;
      });
      if (isScreen) activeScreenUserIds.add(peerId);
      else if (stream.getVideoTracks().length > 0) activeCameraUserIds.add(peerId);

      if (!map.has(peerId)) map.set(peerId, { startedAt });
      const entry = map.get(peerId)!;
      if (isScreen) {
        entry.screen = stream;
        entry.screenId = stream.id;
      } else {
        entry.camera = stream;
        entry.cameraId = stream.id;
      }
    });
    return Array.from(map.entries()).map(([peerId, data]) => ({
      peerId,
      ...data,
    }));
  }, [remoteStreams, activeScreenUserIds, activeCameraUserIds]);

  useEffect(() => {
    if (!streamRouteId) {
      setStreamRoutePlayback(prev =>
        prev.route === "" && prev.activeVideoCount === 0 ? prev : { route: "", activeVideoCount: 0 }
      );
      return;
    }

    setStreamRoutePlayback(prev =>
      prev.route === location.pathname && prev.activeVideoCount === streamsByPeer.length
        ? prev
        : {
            route: location.pathname,
            activeVideoCount: streamsByPeer.length,
          }
    );

    const openFirstVideoStream = (force = false) => {
      const firstVideoStream = streamsByPeer[0];
      const firstVideoId = firstVideoStream?.screenId || firstVideoStream?.cameraId;
      if (!firstVideoStream || !firstVideoId) return;

      if (!force && hasAutoOpenedStreamRef.current === location.pathname) {
        return;
      }
      hasAutoOpenedStreamRef.current = location.pathname;

      const nextEnlargedId = `${firstVideoStream.peerId}-${firstVideoId}`;
      if (enlargedStreamId !== nextEnlargedId) {
        setEnlargedStreamId(nextEnlargedId);
      }
      if (!isPanelExpanded) {
        setIsPanelExpanded(true);
      }
    };

    openFirstVideoStream();
    const handleRetry = () => openFirstVideoStream(true);
    window.addEventListener("stream:retry-open", handleRetry);
    return () => {
      window.removeEventListener("stream:retry-open", handleRetry);
    };
  }, [
    enlargedStreamId,
    isPanelExpanded,
    location.pathname,
    setEnlargedStreamId,
    setIsPanelExpanded,
    setStreamRoutePlayback,
    streamRouteId,
    streamsByPeer,
  ]);

  useEffect(() => {
    return () => {
      if (streamRouteId) {
        setStreamRoutePlayback(prev =>
          prev.route === location.pathname ? { route: "", activeVideoCount: 0 } : prev
        );
      }
    };
  }, [location.pathname, setStreamRoutePlayback, streamRouteId]);

  return (
    <div className={`vp-container ${mediaOnly ? "vp-container-media-only" : ""}`}>
      {!mediaOnly && !permissions.voiceEnabled && (
        <div className="vp-disabled-banner">Voice chat is disabled on this route.</div>
      )}
      {!mediaOnly && permissions.voiceEnabled && !currentUser && !permissions.guestsAllowed && (
        <div
          className="vp-disabled-banner"
          style={{
            background: "rgba(255, 193, 7, 0.15)",
            color: "#ffc107",
            border: "1px solid rgba(255, 193, 7, 0.3)",
          }}
        >
          Guests cannot connect to WebRTC peers on a private route. Login to see tracks.
        </div>
      )}
      {!mediaOnly && permissions.voiceEnabled && currentUser && permissions.guestsAllowed && (
        <div
          className="vp-disabled-banner"
          style={{
            background: "rgba(33, 150, 243, 0.15)",
            color: "#64b5f6",
            border: "1px solid rgba(33, 150, 243, 0.3)",
          }}
        >
          Warning: This is a public route. Guests are allowed to join and view tracks.
        </div>
      )}

      {!mediaOnly && (
        <div
          className="ui-panel vp-settings-panel"
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Audio Controls</h4>
            <button
              className="action-btn "
              onClick={() => setIsPlayerMuted(!isPlayerMuted)}
              title={isPlayerMuted ? "Unmute All" : "Mute All"}
            >
              {isPlayerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>

          <div className="vp-setting-row" style={{ marginBottom: 0 }}>
            <span className="vp-setting-label">
              {micActive ? (
                <Mic size={14} className="vp-text-primary" />
              ) : (
                <MicOff size={14} className="vp-text-secondary" />
              )}
              Voice Chat
            </span>
            <label className="vp-switch">
              <input
                type="checkbox"
                checked={micActive}
                onChange={toggleMic}
                disabled={!canSpeak}
              />
              <div className="vp-switch-track">
                <div className="vp-switch-thumb" />
              </div>
            </label>
          </div>

          {audioDevices.length > 0 && (
            <Select
              size="sm"
              variant="minimal"
              value={selectedAudioDeviceId}
              onChange={e => handleAudioDeviceChange(e.target.value)}
              options={audioDevices.map(d => ({
                label: d.label || "Microphone",
                value: d.deviceId,
              }))}
            />
          )}

          {activeMicUserIds.size > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                paddingTop: "0.25rem",
                borderTop: "1px solid var(--border-color)",
              }}
            >
              {Array.from(activeMicUserIds).map(uid => {
                const isCurrentUser = uid === String(myPresenceId);
                // The current user speaks if their local activeSpeakers was updated recently
                const isSpeaking = now - (activeSpeakers[uid] || 0) < 300;
                let user;
                if (isCurrentUser && currentUser) {
                  user = {
                    user_name: currentUser.display_name || currentUser.username,
                    avatar: currentUser.avatar_url,
                  };
                } else {
                  user = onlineUsers.find(u => String(u.user_id) === uid);
                }

                if (!user) return null;

                const connState =
                  peerConnectionStates[uid] || (isCurrentUser ? "connected" : "connecting");
                const stateColor =
                  connState === "connected"
                    ? "var(--success-color, #10b981)"
                    : connState === "failed"
                      ? "var(--error-color, #ef4444)"
                      : "var(--warning-color, #f59e0b)"; // connecting, disconnected, new

                return (
                  <UserProfileOverlay
                    key={uid}
                    userId={uid}
                    fallbackName={user.user_name}
                    fallbackAvatar={user.avatar || undefined}
                  >
                    <div
                      title={`Connection: ${connState}`}
                      style={{
                        position: "relative",
                        display: "flex",
                        borderRadius: "50%",
                        transition: "box-shadow 0.15s ease",
                        boxShadow: isSpeaking
                          ? "0 0 0 2px var(--primary-color), 0 0 8px var(--primary-color)"
                          : "none",
                      }}
                    >
                      <UserAvatar src={user.avatar || undefined} alt={user.user_name} size={28} />
                      {!isCurrentUser && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -2,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: stateColor,
                            border: "2px solid var(--surface-2)",
                            zIndex: 2,
                          }}
                        />
                      )}
                    </div>
                  </UserProfileOverlay>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!mediaOnly && videoDevices.length > 0 && (
        <div
          className="ui-panel vp-settings-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            marginTop: "12px",
          }}
        >
          <div className="vp-setting-row" style={{ marginBottom: 0 }}>
            <span className="vp-setting-label">
              {cameraActive ? (
                <Video size={14} className="vp-text-primary" />
              ) : (
                <VideoOff size={14} className="vp-text-secondary" />
              )}
              Camera
            </span>
            <label className="vp-switch">
              <input
                type="checkbox"
                checked={cameraActive}
                onChange={toggleCamera}
                disabled={!canSpeak}
              />
              <div className="vp-switch-track">
                <div className="vp-switch-thumb" />
              </div>
            </label>
          </div>

          {videoDevices.length > 0 && (
            <Select
              size="sm"
              variant="minimal"
              value={selectedVideoDeviceId}
              onChange={e => handleVideoDeviceChange(e.target.value)}
              options={videoDevices.map(d => ({
                label: d.label || "Camera",
                value: d.deviceId,
              }))}
            />
          )}

          {activeCameraUserIds.size > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                paddingTop: "0.25rem",
                borderTop: "1px solid var(--border-color)",
              }}
            >
              {Array.from(activeCameraUserIds).map(uid => {
                const isCurrentUser = uid === String(myPresenceId);
                let user;
                if (isCurrentUser && currentUser) {
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
                    key={`cam-${uid}`}
                    userId={uid}
                    fallbackName={user.user_name}
                    fallbackAvatar={user.avatar || undefined}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <UserAvatar
                        src={user.avatar || undefined}
                        alt={user.user_name}
                        size={20}
                        style={{
                          border: "1px solid var(--primary)",
                          padding: "1px",
                          borderRadius: "50%",
                        }}
                      />
                    </div>
                  </UserProfileOverlay>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!mediaOnly && (
        <div
          className="ui-panel vp-settings-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            marginTop: "12px",
          }}
        >
          <div className="vp-setting-row" style={{ marginBottom: 0 }}>
            <span className="vp-setting-label">
              <MonitorUp
                size={14}
                className={screenActive ? "vp-text-primary" : "vp-text-secondary"}
              />
              Screen Share
            </span>
            <div className="vp-setting-actions">
              {!streamRouteId && (
                <button
                  type="button"
                  className="action-btn"
                  title="Open personal stream route"
                  onClick={() => navigate("/stream")}
                >
                  <Radio size={14} />
                </button>
              )}
              <label className="vp-switch">
                <input
                  type="checkbox"
                  checked={screenActive}
                  onChange={toggleScreen}
                  disabled={
                    !canSpeak ||
                    !(
                      typeof navigator !== "undefined" &&
                      navigator.mediaDevices &&
                      "getDisplayMedia" in navigator.mediaDevices
                    )
                  }
                />
                <div className="vp-switch-track">
                  <div className="vp-switch-thumb" />
                </div>
              </label>
            </div>
          </div>
          <div className="vp-setting-row" style={{ marginBottom: 0 }}>
            <span className="vp-setting-label">
              <Save size={14} className={recordLocally ? "vp-text-primary" : "vp-text-secondary"} />
              Record Locally
            </span>
            <label className="vp-switch">
              <input
                type="checkbox"
                checked={recordLocally}
                onChange={e => setRecordLocally(e.target.checked)}
                disabled={!screenActive && !canSpeak}
              />
              <div className="vp-switch-track">
                <div className="vp-switch-thumb" />
              </div>
            </label>
          </div>
          {activeScreenUserIds.size > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                paddingTop: "0.25rem",
                borderTop: "1px solid var(--border-color)",
              }}
            >
              {Array.from(activeScreenUserIds).map(uid => {
                const isCurrentUser = uid === String(myPresenceId);
                let user;
                if (isCurrentUser && currentUser) {
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
                    key={`screen-${uid}`}
                    userId={uid}
                    fallbackName={user.user_name}
                    fallbackAvatar={user.avatar || undefined}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <UserAvatar
                        src={user.avatar || undefined}
                        alt={user.user_name}
                        size={20}
                        style={{
                          border: "1px solid var(--primary)",
                          padding: "1px",
                          borderRadius: "50%",
                        }}
                      />
                    </div>
                  </UserProfileOverlay>
                );
              })}
            </div>
          )}

          {streamsByPeer.length > 0 && (
            <ActiveStreams
              streamsByPeer={streamsByPeer}
              onlineUsers={onlineUsers}
              setEnlargedStreamId={setEnlargedStreamId}
              globalVolume={globalVolume}
            />
          )}
        </div>
      )}

      {!voiceOnly && (
        <MediaSection
          mediaState={mediaState}
          socket={socket}
          location={location}
          myPresenceId={myPresenceId as number}
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          isPlayerMuted={isPlayerMuted}
          hasManagePermission={hasManagePermission}
          playTransitionSound={playTransitionSound}
        />
      )}

      {!mediaOnly && canManageVoice && <AdminSettings />}

      {!mediaOnly && streamRouteId && permissions.canManage && (
        <StreamMetaEditor streamId={streamRouteId} stream={streamMetaPreviewStream} />
      )}

      {!mediaOnly && (
        <div className="ui-panel vp-settings-panel">
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              opacity: 0.6,
              marginBottom: "8px",
              marginTop: "4px",
            }}
          >
            Developer / Diagnostics
          </div>
          <div className="vp-setting-row">
            <span className="vp-setting-label">
              <Settings size={14} />
              Use SkaiaRTC (v2)
            </span>
            <label className="vp-switch">
              <input
                type="checkbox"
                checked={useV2RTC}
                onChange={e => setUseV2RTC(e.target.checked)}
              />
              <div className="vp-switch-track">
                <div className="vp-switch-thumb" />
              </div>
            </label>
          </div>
        </div>
      )}

      <EnlargedStream
        enlargedStreamId={enlargedStreamId}
        setEnlargedStreamId={setEnlargedStreamId}
        isPanelExpanded={isPanelExpanded}
        remoteStreams={remoteStreams}
        onlineUsers={onlineUsers}
        globalVolume={globalVolume}
      />
    </div>
  );
}

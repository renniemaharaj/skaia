import { useAtom, useAtomValue } from "jotai";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Settings,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  MonitorUp,
} from "lucide-react";
import {
  Calendar,
  History as HistoryIcon,
  LayoutGrid,
  List,
  ListVideo,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { currentUserAtom, hasPermissionAtom, socketAtom } from "../../../atoms/auth";
import { mediaStateAtom, playerMutedAtom } from "../../../atoms/media";
import { onlineUsersAtom, presencePanelExpandedAtom } from "../../../atoms/presence";
import { enlargedStreamIdAtom, voicePermissionsAtom, useV2RTCAtom } from "../../../atoms/voice";
import { getGuestSessionId } from "../../../utils/guestSession";
import { relativeTimeAgo } from "../../../utils/serverTime";
import { getSoundVolume } from "../../../utils/sound";
import { sendWebSocketMessage } from "../../../utils/wsProtobuf";
import Button from "../../input/Button";
import Select from "../../input/Select";
import UserAvatar from "../../user/UserAvatar";
import UserProfileOverlay from "../../user/UserProfileOverlay";
import YouTubePlayer from "./YouTubePlayer";
import type { YouTubePlayerRef } from "./YouTubePlayer";
import "../../ui/MediaPreviewLightbox.css";
import "./VoicePanel.css";
import { useLocation, useSearchParams } from "react-router-dom";
import { normalizeRoute } from "../../../utils/route";

function getMicrophoneErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      return "Microphone access was blocked. Allow microphone permissions and try again.";
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "No microphone was found for this device.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "Your microphone is already in use by another app.";
    }
  }

  return "Could not access microphone.";
}

import { useWebRTCManager } from "../../../lib/webrtc/useWebRTCManager";
import { type VoiceSignalPayload } from "../../../lib/webrtc/WebRTCManager";

interface VoicePanelProps {
  mediaOnly?: boolean;
  voiceOnly?: boolean;
}

const DraggablePiP = ({ stream }: { stream: MediaStream }) => {
  const [pos, setPos] = useState({ right: 24, bottom: 64 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    initialRight: 0,
    initialBottom: 0,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialRight: pos.right,
      initialBottom: pos.bottom,
    };
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({
        right: Math.max(0, dragRef.current.initialRight - dx),
        bottom: Math.max(0, dragRef.current.initialBottom - dy),
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  return (
    <div
      style={{
        position: "absolute",
        right: pos.right,
        bottom: pos.bottom,
        width: "240px",
        height: "180px",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.2)",
        backgroundColor: "#000",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        cursor: dragging ? "grabbing" : "grab",
        zIndex: 50,
      }}
      onMouseDown={handleMouseDown}
    >
      <RemoteMedia stream={stream} volume={0} objectFit="cover" />
    </div>
  );
};

const RemoteMedia = ({
  stream,
  volume,
  objectFit = "cover",
  isModal = false,
}: {
  stream: MediaStream;
  volume: number;
  objectFit?: "cover" | "contain";
  isModal?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(stream.getVideoTracks().length > 0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const checkVideo = () => setHasVideo(stream.getVideoTracks().length > 0);
    stream.addEventListener("addtrack", checkVideo);
    stream.addEventListener("removetrack", checkVideo);
    return () => {
      stream.removeEventListener("addtrack", checkVideo);
      stream.removeEventListener("removetrack", checkVideo);
    };
  }, [stream]);

  if (!hasVideo) {
    return <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />;
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={!isModal && !isHovered}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width: "100%", height: "100%", objectFit, display: "block" }}
    />
  );
};

export default function VoicePanel({ mediaOnly = false, voiceOnly = false }: VoicePanelProps = {}) {
  const [globalVolume, setGlobalVolume] = useState(() => getSoundVolume());
  const globalVolumeRef = useRef(globalVolume);
  globalVolumeRef.current = globalVolume;
  const [isPlayerMuted, setIsPlayerMuted] = useAtom(playerMutedAtom);
  const isPlayerMutedRef = useRef(isPlayerMuted);
  isPlayerMutedRef.current = isPlayerMuted;
  const [historyViewMode, setHistoryViewMode] = useState<"list" | "playlists">("list");
  const [useV2RTC, setUseV2RTC] = useAtom(useV2RTCAtom);

  useEffect(() => {
    const handleVolumeChange = (e: Event) => {
      setGlobalVolume((e as CustomEvent<number>).detail);
    };
    window.addEventListener("sound:volume-change", handleVolumeChange);
    return () => window.removeEventListener("sound:volume-change", handleVolumeChange);
  }, []);

  const permissions = useAtomValue(voicePermissionsAtom);
  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const onlineUsers = useAtomValue(onlineUsersAtom);
  const hasManagePermission = useAtomValue(hasPermissionAtom)("home.manage");
  const mediaState = useAtomValue(mediaStateAtom);
  const location = useLocation();
  const playerRef = useRef<YouTubePlayerRef>(null);

  const [micActive, setMicActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const [enlargedStreamId, setEnlargedStreamId] = useAtom(enlargedStreamIdAtom);
  const [isPanelExpanded, setIsPanelExpanded] = useAtom(presencePanelExpandedAtom);
  const [searchParams, setSearchParams] = useSearchParams();

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

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");

  useEffect(() => {
    const updateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audios = devices.filter(d => d.kind === "audioinput");
        const videos = devices.filter(d => d.kind === "videoinput");
        setAudioDevices(audios);
        setVideoDevices(videos);
        if (audios.length > 0 && !selectedAudioDeviceId)
          setSelectedAudioDeviceId(audios[0].deviceId);
        if (videos.length > 0 && !selectedVideoDeviceId)
          setSelectedVideoDeviceId(videos[0].deviceId);
      } catch (err) {
        console.error("Could not enumerate devices:", err);
      }
    };
    updateDevices();
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
  }, [selectedAudioDeviceId, selectedVideoDeviceId, micActive, cameraActive]);

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

  useEffect(() => {
    if (autoplayBlocked) {
      toast("Browser blocked audio autoplay. Please interact with the page.", {
        icon: "🔇",
        duration: 5000,
      });
      setAutoplayBlocked(false);
    }
  }, [autoplayBlocked, setAutoplayBlocked]);

  const toggleMic = async () => {
    if (micActive) {
      if (streamRef.current) {
        removeTracks(streamRef.current);
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        streamRef.current = null;
      }
      setMicActive(false);
      return;
    }

    if (!canSpeak) {
      toast.error("You cannot use the microphone on this route right now.");
      return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone access requires a secure browser context.");
      return;
    }

    if (!("RTCPeerConnection" in window)) {
      toast.error("This browser cannot use WebRTC voice chat.");
      return;
    }

    try {
      const { audioContext } = ensureAudioGraph();
      if (audioContext?.state === "suspended") {
        await audioContext.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true,
      });
      streamRef.current = stream;
      setMicActive(true);
      broadcastTracks(stream);
    } catch (err) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        streamRef.current = null;
      }
      toast.error(getMicrophoneErrorMessage(err));
    }
  };

  const handleAudioDeviceChange = async (deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
    if (micActive) {
      if (streamRef.current) {
        removeTracks(streamRef.current);
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        streamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        streamRef.current = stream;
        broadcastTracks(stream);
      } catch (err) {
        setMicActive(false);
        toast.error("Could not switch microphone.");
      }
    }
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      if (cameraStreamRef.current) {
        removeTracks(cameraStreamRef.current);
        cameraStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        cameraStreamRef.current = null;
      }
      setCameraActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true,
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      broadcastTracks(stream);
    } catch (err) {
      toast.error("Could not access camera.");
    }
  };

  const handleVideoDeviceChange = async (deviceId: string) => {
    setSelectedVideoDeviceId(deviceId);
    if (cameraActive) {
      if (cameraStreamRef.current) {
        removeTracks(cameraStreamRef.current);
        cameraStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        cameraStreamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        cameraStreamRef.current = stream;
        broadcastTracks(stream);
      } catch (err) {
        setCameraActive(false);
        toast.error("Could not switch camera.");
      }
    }
  };

  const toggleScreen = async () => {
    if (screenActive) {
      if (screenStreamRef.current) {
        removeTracks(screenStreamRef.current);
        screenStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        screenStreamRef.current = null;
      }
      setScreenActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      stream.getVideoTracks()[0].onended = () => {
        if (screenStreamRef.current) removeTracks(screenStreamRef.current);
        screenStreamRef.current = null;
        setScreenActive(false);
      };
      screenStreamRef.current = stream;
      setScreenActive(true);
      broadcastTracks(stream);
    } catch (err) {
      toast.error("Could not share screen.");
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
    };
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
  ]);

  const validUserIdsRef = useRef(new Set<string>());
  useEffect(() => {
    validUserIdsRef.current = new Set(
      onlineUsers
        .filter(
          u =>
            normalizeRoute(u.route) === normalizeRoute(location.pathname) &&
            u.user_id !== myPresenceId
        )
        .map(u => String(u.user_id))
    );
  }, [onlineUsers, location.pathname, myPresenceId]);

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

  return (
    <div className={`vp-container ${mediaOnly ? "vp-container-media-only" : ""}`}>
      {!mediaOnly && !permissions.voiceEnabled && (
        <div className="vp-disabled-banner">Voice chat is disabled on this route.</div>
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
          )}
        </div>
      )}

      {!voiceOnly && (
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
                  .filter((item, idx) => idx === 0 || item.id === transitioningItemId)
                  .concat(retiredItems)
                  .map((item: any, idx) => {
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
                          updatedAt={
                            isPrimary ? mediaState.updated_at || "" : new Date().toISOString()
                          }
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
                    {mediaState.queue.slice(1).map((item, index) => (
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
                  {mediaState.playlists.map(playlist => (
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
                        {playlist.items.map(item => (
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
                  {mediaState.history.map(item => (
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
      )}

      {!mediaOnly && hasManagePermission && (
        <div className="ui-panel vp-settings-panel vp-admin-settings">
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
            Moderation Controls
          </div>
          <div className="vp-setting-row">
            <span className="vp-setting-label vp-text-error">
              <Settings size={14} />
              Route Voice
            </span>
            <label className="vp-switch">
              <input
                type="checkbox"
                checked={permissions.voiceEnabled}
                onChange={() => {
                  if (socket) {
                    sendWebSocketMessage(socket, {
                      type: "voice:control",
                      payload: {
                        route: normalizeRoute(location.pathname),
                        action: permissions.voiceEnabled ? "disable" : "enable",
                      },
                    });
                  }
                }}
              />
              <div className="vp-switch-track vp-switch-track--danger">
                <div className="vp-switch-thumb" />
              </div>
            </label>
          </div>

          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              opacity: 0.6,
              marginBottom: "8px",
              marginTop: "16px",
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

      {(() => {
        if (!enlargedStreamId) return null;
        if (!isPanelExpanded) return null; // Hide if presence panel is collapsed

        const enlarged = remoteStreams.find(s => `${s.peerId}-${s.stream.id}` === enlargedStreamId);
        const hasActiveVideo =
          enlarged && enlarged.stream.getVideoTracks().some(t => t.readyState !== "ended");

        const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
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
                  <div style={{ fontSize: "16px", fontWeight: 500 }}>Stream ended or not found</div>
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
                zIndex: 2001, // Above presence panel's modal backdrop
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
                      s.stream.getVideoTracks().some(t => t.readyState !== "ended")
                  );
                  if (otherStreams.length > 0) {
                    return <DraggablePiP stream={otherStreams[0].stream} />;
                  }
                  return null;
                })()}
              </div>
              <div className="up-upload-lightbox-bar">
                <span className="up-upload-lightbox-name">
                  <UserAvatar src={u?.avatar || undefined} alt={name} size={16} />
                  <span style={{ marginLeft: "8px", marginRight: "8px" }}>{name}'s Stream</span>
                  <span style={{ opacity: 0.7, fontSize: "0.9em" }}>
                    {relativeTimeAgo(enlarged.startedAt)}
                  </span>
                </span>
                <div className="thread-actions">
                  <button
                    type="button"
                    className="action-btn view-btn"
                    title="Close"
                    onClick={() => setEnlargedStreamId(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>,
            document.body
          );
        }

        // Mobile fallback / non-split fallback
        return createPortal(
          <dialog
            open
            className="up-upload-lightbox media-preview-lightbox"
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
                      s.stream.getVideoTracks().some(t => t.readyState !== "ended")
                  );
                  if (otherStreams.length > 0) {
                    return <DraggablePiP stream={otherStreams[0].stream} />;
                  }
                  return null;
                })()}
              </div>
              <div className="up-upload-lightbox-bar">
                <span className="up-upload-lightbox-name">
                  <UserAvatar src={u?.avatar || undefined} alt={name} size={16} />
                  <span style={{ marginLeft: "8px", marginRight: "8px" }}>{name}'s Stream</span>
                  <span style={{ opacity: 0.7, fontSize: "0.9em" }}>
                    {relativeTimeAgo(enlarged.startedAt)}
                  </span>
                </span>
                <div className="thread-actions">
                  <button
                    type="button"
                    className="action-btn view-btn"
                    title="Close"
                    onClick={() => setEnlargedStreamId(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          </dialog>,
          document.body
        );
      })()}
    </div>
  );
}

import { useAtom, useAtomValue } from "jotai";
import { Mic, MicOff, Play, Pause, Settings } from "lucide-react";
import { useCallback, useState, useRef, useEffect } from "react";
import { globalVolumeAtom, voicePermissionsAtom } from "../../../atoms/voice";
import { mediaStateAtom } from "../../../atoms/media";
import YouTubePlayer from "./YouTubePlayer";
import type { YouTubePlayerRef } from "./YouTubePlayer";
import { Plus, X, Trash2, ListVideo, History as HistoryIcon } from "lucide-react";
import {
  socketAtom,
  currentUserAtom,
  hasPermissionAtom,
} from "../../../atoms/auth";
import { toast } from "sonner";
import "./VoicePanel.css";
import { useLocation } from "react-router-dom";

const voiceMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
];

function getSupportedRecorderMimeType(): string | undefined {
  if (!("MediaRecorder" in window)) {
    return undefined;
  }

  return voiceMimeTypes.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function getSupportedPlaybackMimeType(): string | undefined {
  if (!("MediaSource" in window)) {
    return undefined;
  }

  return voiceMimeTypes.find((mimeType) =>
    MediaSource.isTypeSupported(mimeType),
  );
}

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

interface VoiceStreamPlayer {
  audio: HTMLAudioElement;
  mediaSource: MediaSource;
  objectUrl: string;
  sourceBuffer: SourceBuffer | null;
  queue: Uint8Array[];
  pump: () => void;
}

function createVoiceStreamPlayer(
  audioContext: AudioContext,
  gainNode: GainNode,
): VoiceStreamPlayer | null {
  const playbackMimeType = getSupportedPlaybackMimeType();
  if (!playbackMimeType) {
    return null;
  }

  let player: VoiceStreamPlayer;
  const mediaSource = new MediaSource();
  const audio = new Audio();
  const objectUrl = URL.createObjectURL(mediaSource);

  audio.autoplay = true;
  audio.src = objectUrl;
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audioContext.createMediaElementSource(audio).connect(gainNode);

  const pump = () => {
    const sourceBuffer = player.sourceBuffer;
    if (!sourceBuffer || sourceBuffer.updating || player.queue.length === 0) {
      return;
    }

    const chunk = player.queue.shift();
    if (!chunk) return;

    try {
      const buffer = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength,
      ) as ArrayBuffer;
      sourceBuffer.appendBuffer(buffer);
    } catch {
      player.queue.unshift(chunk);
    }
  };

  player = {
    audio,
    mediaSource,
    objectUrl,
    sourceBuffer: null,
    queue: [],
    pump,
  };

  mediaSource.addEventListener("sourceopen", () => {
    if (player.sourceBuffer) return;

    try {
      const sourceBuffer = mediaSource.addSourceBuffer(playbackMimeType);
      sourceBuffer.mode = "sequence";
      sourceBuffer.addEventListener("updateend", pump);
      player.sourceBuffer = sourceBuffer;
      pump();
    } catch {
      URL.revokeObjectURL(objectUrl);
    }
  });

  return player;
}


export default function VoicePanel() {
  const [globalVolume, setGlobalVolume] = useAtom(globalVolumeAtom);
  const permissions = useAtomValue(voicePermissionsAtom);
  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const hasManagePermission = useAtomValue(hasPermissionAtom)("home.manage");
  const mediaState = useAtomValue(mediaStateAtom);
  const location = useLocation();
  const playerRef = useRef<YouTubePlayerRef>(null);

  const [inputUrl, setInputUrl] = useState("");

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

  const handleAddMedia = (e?: React.FormEvent) => {
    e?.preventDefault();
    const vid = extractYouTubeId(inputUrl);
    if (!vid) {
      toast.error("Invalid YouTube URL");
      return;
    }
    socket?.send(JSON.stringify({
      type: "media:add",
      payload: { route: location.pathname, video_id: vid, loop: false }
    }));
    setInputUrl("");
  };

  const handleRemoveMedia = (itemId: string) => {
    socket?.send(JSON.stringify({
      type: "media:remove",
      payload: { route: location.pathname, item_id: itemId }
    }));
  };

  const handleClearHistory = () => {
    socket?.send(JSON.stringify({
      type: "media:history:clear",
      payload: { route: location.pathname }
    }));
  };

  const handlePauseToggle = async () => {
    let position = 0;
    if (playerRef.current) {
      position = await playerRef.current.getCurrentTime();
    }
    socket?.send(JSON.stringify({
      type: "media:action",
      payload: { route: location.pathname, position }
    }));
  };

  const handleEnded = useCallback(() => {
    if (mediaState?.queue && mediaState.queue.length > 0) {
      socket?.send(JSON.stringify({
        type: "media:ended",
        payload: { route: location.pathname, item_id: mediaState.queue[0].id }
      }));
    }
  }, [mediaState, socket, location.pathname]);

  const [micActive, setMicActive] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const voicePlayersRef = useRef<Map<string, VoiceStreamPlayer>>(new Map());
  const isMutedByAdmin =
    currentUser && permissions.mutedUsers[Number(currentUser.id)];
  const isKicked =
    currentUser && permissions.kickedUsers[Number(currentUser.id)];

  const canSpeak = permissions.voiceEnabled && !isMutedByAdmin && !isKicked;

  const ensureAudioGraph = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
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

  const toggleMic = async () => {
    if (micActive) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
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

    const recorderMimeType = getSupportedRecorderMimeType();
    if (!recorderMimeType) {
      toast.error("This browser cannot record voice chat.");
      return;
    }

    try {
      const { audioContext } = ensureAudioGraph();
      if (audioContext?.state === "suspended") {
        await audioContext.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: recorderMimeType,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
          const buffer = await e.data.arrayBuffer();
          const frame = new Uint8Array(1 + buffer.byteLength);
          frame[0] = 0x01; // Audio Frame
          frame.set(new Uint8Array(buffer), 1);
          socket.send(frame.buffer);
        }
      };

      mediaRecorder.start(100); // 100ms chunks
      setMicActive(true);
    } catch (err) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
      toast.error(getMicrophoneErrorMessage(err));
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
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
      gainNode.gain.setTargetAtTime(
        globalVolume,
        audioContext.currentTime,
        0.03,
      );
    }
  }, [globalVolume]);

  useEffect(() => {
    const handleVoiceBinary = async (event: Event) => {
      const detail = (event as CustomEvent<Blob | ArrayBuffer>).detail;
      const buffer =
        detail instanceof Blob ? await detail.arrayBuffer() : detail;
      if (!buffer || buffer.byteLength < 9) return;

      const view = new DataView(buffer);
      const frameType = view.getUint8(0);
      if (frameType !== 0x01 && frameType !== 0x02) return;

      const senderID = view.getBigInt64(1, true).toString();
      const payload = new Uint8Array(buffer.slice(9));
      const { audioContext, gainNode } = ensureAudioGraph();
      if (!audioContext || !gainNode) return;

      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      let player = voicePlayersRef.current.get(senderID);
      if (!player) {
        player = createVoiceStreamPlayer(audioContext, gainNode) ?? undefined;
        if (!player) {
          toast.error("This browser cannot play the incoming voice stream.");
          return;
        }
        voicePlayersRef.current.set(senderID, player);
      }

      player.queue.push(payload);
      player.pump();
      void player.audio.play().catch(() => {
        // Browser autoplay policy may require a local click before remote audio starts.
      });
    };

    window.addEventListener("voice:binary", handleVoiceBinary);
    return () => {
      window.removeEventListener("voice:binary", handleVoiceBinary);
      for (const player of voicePlayersRef.current.values()) {
        player.audio.pause();
        player.audio.removeAttribute("src");
        URL.revokeObjectURL(player.objectUrl);
      }
      voicePlayersRef.current.clear();
    };
  }, [ensureAudioGraph]);

  return (
    <div className="vp-container">
      {!permissions.voiceEnabled && (
        <div className="vp-disabled-banner">
          Voice chat is disabled on this route.
        </div>
      )}

      <div className="ui-panel vp-settings-panel">
        <div className="vp-setting-row">
          <span className="vp-setting-label">
            {micActive ? <Mic size={14} className="vp-text-primary" /> : <MicOff size={14} className="vp-text-secondary" />}
            Microphone
          </span>
          <label className="vp-switch">
            <input type="checkbox" checked={micActive} onChange={toggleMic} disabled={!canSpeak} />
            <div className="vp-switch-track"><div className="vp-switch-thumb" /></div>
          </label>
        </div>
        
        <div className="vp-setting-row">
          <span className="vp-setting-label vp-vol-label">Volume</span>
          <input
            className="form-range vp-vol-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={globalVolume}
            onChange={(e) => setGlobalVolume(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="vp-media-section ui-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Media Queue</h4>
          {hasManagePermission && (
            <button className="btn btn-sm btn-ghost" onClick={handlePauseToggle} style={{ padding: "2px 6px", fontSize: "0.75rem" }}>
              {mediaState?.is_paused ? <Play size={12} /> : <Pause size={12} />}
              {mediaState?.is_paused ? " Resume" : " Pause"}
            </button>
          )}
        </div>

        <form className="vp-media-input" onSubmit={handleAddMedia}>
          <input
            type="text"
            placeholder="YouTube URL..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
          />
          <button type="submit" className="btn btn-sm btn-primary vp-play-btn" disabled={!inputUrl}>
            <Plus size={14} />
          </button>
        </form>

        {mediaState?.queue && mediaState.queue.length > 0 && (
          <>
            <div className="vp-active-player">
              <YouTubePlayer 
                ref={playerRef}
                videoId={mediaState.queue[0].video_id} 
                isPaused={mediaState.is_paused} 
                currentPosition={mediaState.current_position || 0}
                updatedAt={mediaState.updated_at || ""}
                onEnded={handleEnded} 
              />
            </div>
            
            {mediaState.queue.length > 1 && (
              <div className="vp-queue-list">
                <div className="vp-queue-header">
                  <ListVideo size={12} /> Up Next
                </div>
                <div className="vp-queue-scroll">
                  {mediaState.queue.slice(1).map(item => (
                    <div key={item.id} className="vp-queue-item">
                      <img src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`} alt="Thumbnail" />
                      <div className="vp-queue-item-overlay">
                        <button onClick={() => handleRemoveMedia(item.id)} className="btn btn-ghost" style={{ padding: "0.25rem", borderRadius: "50%" }}>
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
            <div className="vp-queue-header" style={{ display: "flex", justifyContent: "space-between" }}>
              <span><HistoryIcon size={12} /> History</span>
              {hasManagePermission && (
                <button className="btn btn-ghost text-error" onClick={handleClearHistory} style={{ padding: "0.1rem 0.25rem" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div className="vp-queue-scroll">
              {mediaState.history.map(item => (
                <div key={item.id} className="vp-queue-item">
                  <img src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`} alt="Thumbnail" />
                  <div className="vp-queue-item-overlay">
                    <button onClick={() => {
                       socket?.send(JSON.stringify({
                         type: "media:add",
                         payload: { route: location.pathname, video_id: item.video_id, loop: false }
                       }));
                    }} className="btn btn-ghost" style={{ padding: "0.25rem", borderRadius: "50%" }} title="Play Again">
                      <Play size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasManagePermission && (
        <div className="ui-panel vp-settings-panel vp-admin-settings">
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
                  socket?.send(
                    JSON.stringify({
                      type: "voice:control",
                      payload: {
                        route: location.pathname,
                        action: permissions.voiceEnabled ? "disable" : "enable",
                      },
                    }),
                  );
                }}
              />
              <div className="vp-switch-track vp-switch-track--danger"><div className="vp-switch-thumb" /></div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

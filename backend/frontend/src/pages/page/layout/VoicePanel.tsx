import { useAtom, useAtomValue } from "jotai";
import { Mic, MicOff, Play, Pause, Settings } from "lucide-react";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { globalVolumeAtom, voicePermissionsAtom } from "../../../atoms/voice";
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

function getYouTubeEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    const videoId =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : url.pathname.startsWith("/embed/")
          ? url.pathname.split("/")[2]
          : url.searchParams.get("v");

    if (
      !videoId ||
      !["youtube.com", "m.youtube.com", "youtu.be"].includes(host)
    ) {
      return null;
    }

    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
  } catch {
    return null;
  }
}

export default function VoicePanel() {
  const [globalVolume, setGlobalVolume] = useAtom(globalVolumeAtom);
  const permissions = useAtomValue(voicePermissionsAtom);
  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const hasManagePermission = useAtomValue(hasPermissionAtom)("home.manage");
  const location = useLocation();

  const [micActive, setMicActive] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mediaUrl, setMediaUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const voicePlayersRef = useRef<Map<string, VoiceStreamPlayer>>(new Map());
  const youtubeEmbedUrl = useMemo(
    () => getYouTubeEmbedUrl(mediaUrl),
    [mediaUrl],
  );

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

      <div className="vp-controls-row">
        <button
          className={`btn btn-sm btn-pill ${micActive ? "btn-primary vp-mic-btn--active" : "btn-ghost"}`}
          onClick={toggleMic}
          disabled={!canSpeak}
        >
          {micActive ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <div className="vp-volume-control">
          <label>Volume</label>
          <input
            className="form-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={globalVolume}
            onChange={(e) => setGlobalVolume(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div
        className="vp-media-section ui-panel"
        style={{ opacity: 0.5, pointerEvents: "none", position: "relative" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h4 style={{ margin: 0 }}>Media Player</h4>
          <span style={{ fontSize: "0.7rem", fontWeight: "bold", textTransform: "uppercase", background: "var(--bg-tertiary, rgba(0,0,0,0.2))", padding: "2px 6px", borderRadius: "4px" }}>Coming Soon</span>
        </div>
        <div className="vp-media-input">
          <input
            type="text"
            placeholder="YouTube URL or Audio Link..."
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            disabled
          />
          <button
            className="btn btn-sm btn-primary vp-play-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            disabled
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>

        {isPlaying && youtubeEmbedUrl ? (
          <div className="vp-iframe-wrapper">
            <iframe
              src={youtubeEmbedUrl}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : isPlaying && mediaUrl ? (
          <audio ref={audioRef} src={mediaUrl} autoPlay loop />
        ) : null}
      </div>

      {hasManagePermission && (
        <div className="vp-admin-section">
          <h4>Admin Controls</h4>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
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
          >
            <Settings size={12} />
            {permissions.voiceEnabled
              ? "Disable Route Voice"
              : "Enable Route Voice"}
          </button>
        </div>
      )}
    </div>
  );
}

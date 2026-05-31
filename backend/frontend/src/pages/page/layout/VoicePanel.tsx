import { useAtomValue } from "jotai";
import { Mic, MicOff, Play, Pause, Settings } from "lucide-react";
import { useCallback, useState, useRef, useEffect } from "react";
import { voicePermissionsAtom } from "../../../atoms/voice";
import { getSoundVolume } from "../../../utils/sound";
import { mediaStateAtom } from "../../../atoms/media";
import YouTubePlayer from "./YouTubePlayer";
import type { YouTubePlayerRef } from "./YouTubePlayer";
import {
  Plus,
  X,
  Trash2,
  ListVideo,
  History as HistoryIcon,
  Wind,
  Bell,
  Bot,
  Sparkles
} from "lucide-react";
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
  const [globalVolume, setGlobalVolume] = useState(() => getSoundVolume());

  useEffect(() => {
    const handleVolumeChange = (e: Event) => {
      setGlobalVolume((e as CustomEvent<number>).detail);
    };
    window.addEventListener("sound:volume-change", handleVolumeChange);
    return () =>
      window.removeEventListener("sound:volume-change", handleVolumeChange);
  }, []);

  const permissions = useAtomValue(voicePermissionsAtom);
  const socket = useAtomValue(socketAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const hasManagePermission = useAtomValue(hasPermissionAtom)("home.manage");
  const mediaState = useAtomValue(mediaStateAtom);
  const location = useLocation();
  const playerRef = useRef<YouTubePlayerRef>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

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

  const playSoundEffect = useCallback((type: 'swoosh' | 'ding' | 'boop' | 'chime') => {
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
      
      if (type === 'swoosh') {
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
        soundGain.gain.setValueAtTime(0, t);
        soundGain.gain.linearRampToValueAtTime(0.5, t + 0.05);
        soundGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      } else if (type === 'ding') {
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, t);
        soundGain.gain.setValueAtTime(0, t);
        soundGain.gain.linearRampToValueAtTime(0.3, t + 0.02);
        soundGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);
      } else if (type === 'boop') {
        osc.type = "square";
        osc.frequency.setValueAtTime(300, t);
        soundGain.gain.setValueAtTime(0, t);
        soundGain.gain.linearRampToValueAtTime(0.2, t + 0.02);
        soundGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (type === 'chime') {
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
  }, [ensureAudioGraph]);

  const playTransitionSound = useCallback(() => playSoundEffect('swoosh'), [playSoundEffect]);

  const triggerSoundEffect = useCallback((type: 'swoosh' | 'ding' | 'boop' | 'chime') => {
    playSoundEffect(type);
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "media:sfx",
          payload: { route: location.pathname, sfx_type: type },
        })
      );
    }
  }, [playSoundEffect, socket, location.pathname]);

  useEffect(() => {
    const handleSfx = (e: Event) => {
      const type = (e as CustomEvent<string>).detail;
      if (type) playSoundEffect(type as any);
    };
    window.addEventListener("media:sfx", handleSfx);
    return () => window.removeEventListener("media:sfx", handleSfx);
  }, [playSoundEffect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      switch (e.key) {
        case '1': triggerSoundEffect('swoosh'); break;
        case '2': triggerSoundEffect('ding'); break;
        case '3': triggerSoundEffect('boop'); break;
        case '4': triggerSoundEffect('chime'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerSoundEffect]);

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

    socket?.send(
      JSON.stringify({
        type: "media:transition",
        payload: {
          route: location.pathname,
          item_id: mediaStateRef.current.queue[0].id,
          position: pos,
        },
      }),
    );
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
          setSessionPlayTime((p) => p + 1);
        }
      } else {
        setCurrentProgress(0);
        setDuration(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [mediaState?.queue?.length, mediaState?.is_paused]);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
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
      try {
        const res = await fetch(
          `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(inputUrl)}&filter=videos`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(
            data.items.slice(0, 5).map((item: any) => ({
              id: item.url.split("?v=")[1] || item.url.split("/watch?v=")[1],
              title: item.title,
              thumbnail: item.thumbnail,
            })),
          );
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputUrl]);

  const handleAddMedia = (e?: React.FormEvent) => {
    e?.preventDefault();
    const vid = extractYouTubeId(inputUrl);
    if (!vid) {
      if (searchResults.length > 0) {
        socket?.send(
          JSON.stringify({
            type: "media:add",
            payload: {
              route: location.pathname,
              video_id: searchResults[0].id,
              loop: false,
            },
          }),
        );
        setInputUrl("");
        setSearchResults([]);
      } else {
        toast.error("Invalid YouTube URL");
      }
      return;
    }
    socket?.send(
      JSON.stringify({
        type: "media:add",
        payload: { route: location.pathname, video_id: vid, loop: false },
      }),
    );
    setInputUrl("");
    setSearchResults([]);
  };

  const handleRemoveMedia = (itemId: string) => {
    socket?.send(
      JSON.stringify({
        type: "media:remove",
        payload: { route: location.pathname, item_id: itemId },
      }),
    );
  };

  const handleClearHistory = () => {
    socket?.send(
      JSON.stringify({
        type: "media:history:clear",
        payload: { route: location.pathname },
      }),
    );
  };

  const handlePauseToggle = async () => {
    let position = 0;
    if (playerRef.current) {
      position = await playerRef.current.getCurrentTime();
    }
    socket?.send(
      JSON.stringify({
        type: "media:action",
        payload: { route: location.pathname, position },
      }),
    );
  };

  const [retiredItems, setRetiredItems] = useState<any[]>([]);
  const prevQueueRef = useRef(mediaState?.queue || []);

  useEffect(() => {
    if (!mediaState?.queue) return;
    const currentIds = new Set(mediaState.queue.map((i: any) => i.id));
    const removed = prevQueueRef.current.filter((i: any) => !currentIds.has(i.id) && i.id !== transitioningItemId);
    
    if (removed.length > 0) {
      setRetiredItems((prev) => [
        ...prev,
        ...removed.map((r: any) => ({ ...r, _retired: true }))
      ]);
      setTimeout(() => {
        setRetiredItems((prev) => prev.filter((i: any) => !removed.find((r: any) => r.id === i.id)));
      }, 5000);
    }
    prevQueueRef.current = mediaState.queue;
  }, [mediaState?.queue, transitioningItemId]);

  const handleEnded = useCallback(() => {
    if (mediaState?.queue && mediaState.queue.length > 0) {
      socket?.send(
        JSON.stringify({
          type: "media:ended",
          payload: {
            route: location.pathname,
            item_id: mediaState.queue[0].id,
          },
        }),
      );
    }
  }, [mediaState, socket, location.pathname]);

  const [micActive, setMicActive] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const voicePlayersRef = useRef<Map<string, VoiceStreamPlayer>>(new Map());
  const isMutedByAdmin =
    currentUser && permissions.mutedUsers[Number(currentUser.id)];
  const isKicked =
    currentUser && permissions.kickedUsers[Number(currentUser.id)];

  const canSpeak = permissions.voiceEnabled && !isMutedByAdmin && !isKicked;

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
          if (currentUser) {
            window.dispatchEvent(new CustomEvent("voice:speaking", { detail: String(currentUser.id) }));
          }
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
      window.dispatchEvent(new CustomEvent("voice:speaking", { detail: senderID }));

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
            {micActive ? (
              <Mic size={14} className="vp-text-primary" />
            ) : (
              <MicOff size={14} className="vp-text-secondary" />
            )}
            Microphone
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
      </div>

      <div className="vp-media-section ui-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <h4>Media Queue</h4>
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-ghost" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", height: "32px", width: "32px" }} onClick={(e) => { e.preventDefault(); triggerSoundEffect('swoosh'); }} title="Swoosh (1)">
                <Wind size={16} />
                <span style={{ position: "absolute", top: "-4px", right: "-6px", fontSize: "9px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--text-primary, #fff)", padding: "1px 4px", borderRadius: "6px", lineHeight: 1, pointerEvents: "none" }}>1</span>
              </button>
              <button className="btn btn-ghost" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", height: "32px", width: "32px" }} onClick={(e) => { e.preventDefault(); triggerSoundEffect('ding'); }} title="Ding (2)">
                <Bell size={16} />
                <span style={{ position: "absolute", top: "-4px", right: "-6px", fontSize: "9px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--text-primary, #fff)", padding: "1px 4px", borderRadius: "6px", lineHeight: 1, pointerEvents: "none" }}>2</span>
              </button>
              <button className="btn btn-ghost" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", height: "32px", width: "32px" }} onClick={(e) => { e.preventDefault(); triggerSoundEffect('boop'); }} title="Boop (3)">
                <Bot size={16} />
                <span style={{ position: "absolute", top: "-4px", right: "-6px", fontSize: "9px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--text-primary, #fff)", padding: "1px 4px", borderRadius: "6px", lineHeight: 1, pointerEvents: "none" }}>3</span>
              </button>
              <button className="btn btn-ghost" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", height: "32px", width: "32px" }} onClick={(e) => { e.preventDefault(); triggerSoundEffect('chime'); }} title="Chime (4)">
                <Sparkles size={16} />
                <span style={{ position: "absolute", top: "-4px", right: "-6px", fontSize: "9px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--text-primary, #fff)", padding: "1px 4px", borderRadius: "6px", lineHeight: 1, pointerEvents: "none" }}>4</span>
              </button>
            </div>
          </div>
          {hasManagePermission && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={handlePauseToggle}
              style={{ padding: "2px 6px", fontSize: "0.75rem" }}
            >
              {mediaState?.is_paused ? <Play size={12} /> : <Pause size={12} />}
              {mediaState?.is_paused ? " Resume" : " Pause"}
            </button>
          )}
        </div>

        <form className="vp-media-input" onSubmit={handleAddMedia}>
          <input
            type="text"
            placeholder="Search or YouTube URL..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-sm btn-primary vp-play-btn"
            disabled={!inputUrl || isSearching}
          >
            {isSearching ? (
              <span style={{ fontSize: "10px" }}>...</span>
            ) : (
              <Plus size={14} />
            )}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="vp-search-results">
            {searchResults.map((res) => (
              <div
                key={res.id}
                className="vp-search-result-item"
                onClick={() => {
                  socket?.send(
                    JSON.stringify({
                      type: "media:add",
                      payload: {
                        route: location.pathname,
                        video_id: res.id,
                        loop: false,
                      },
                    }),
                  );
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
                <span className="vp-text-secondary">Prog:</span>{" "}
                {formatTime(currentProgress)}
              </div>
              <div>
                <span className="vp-text-secondary">Left:</span>{" "}
                {formatTime(Math.max(0, duration - currentProgress))}
              </div>
              <div>
                <span className="vp-text-secondary">Session:</span>{" "}
                {formatTime(sessionPlayTime)}
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
                    <div key={`${item.id}${isPrimary ? '-primary' : ''}`} style={{ flex: 1, minWidth: 0, height: "100%", display: isRetired ? "none" : "block" }}>
                      <YouTubePlayer
                        ref={isPrimary ? playerRef : (!isRetired ? transitionPlayerRef : null)}
                        videoId={item.video_id}
                        isPaused={isPrimary ? mediaState.is_paused : (isRetired ? true : false)}
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
                              className="btn btn-ghost"
                              style={{
                                padding: "0",
                                borderRadius: "50%",
                                position: "relative",
                                width: "24px",
                                height: "24px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
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
                                  strokeDashoffset={
                                    62.8 - (62.8 * transitionProgress) / 100
                                  }
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
                                socket?.send(
                                  JSON.stringify({
                                    type: "media:transition:start",
                                    payload: {
                                      route: location.pathname,
                                      item_id: item.id,
                                    },
                                  })
                                );
                              }}
                              className="btn btn-ghost"
                              style={{
                                padding: "0.25rem",
                                borderRadius: "50%",
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
                                <path d="M16 3h5v5"></path>
                                <path d="M4 20L21 3"></path>
                                <path d="M21 16v5h-5"></path>
                                <path d="M15 15l6 6"></path>
                                <path d="M4 4l5 5"></path>
                              </svg>
                            </button>
                          ))}
                        
                        {index === 0 && transitioningItemId !== item.id && (
                          <button
                            onClick={() => {
                              socket?.send(
                                JSON.stringify({
                                  type: "media:transition",
                                  payload: {
                                    route: location.pathname,
                                    item_id: mediaState.queue[0].id,
                                    position: 0,
                                  },
                                })
                              );
                            }}
                            className="btn btn-ghost"
                            style={{
                              padding: "0.25rem",
                              borderRadius: "50%",
                              marginRight: "4px",
                            }}
                            title="Play Now"
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveMedia(item.id)}
                          className="btn btn-ghost vp-btn-danger"
                          style={{ padding: "0.25rem", borderRadius: "50%" }}
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
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <HistoryIcon size={12} /> History
              </span>
              {hasManagePermission && (
                <button
                  className="btn btn-ghost text-error"
                  onClick={handleClearHistory}
                  style={{ padding: "0.1rem 0.25rem" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div className="vp-queue-scroll">
              {mediaState.history.map((item) => (
                <div key={item.id} className="vp-queue-item">
                  <img
                    src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`}
                    alt="Thumbnail"
                  />
                  <div className="vp-queue-item-overlay">
                    <button
                      onClick={() => {
                        socket?.send(
                          JSON.stringify({
                            type: "media:add",
                            payload: {
                              route: location.pathname,
                              video_id: item.video_id,
                              loop: false,
                            },
                          }),
                        );
                      }}
                      className="btn btn-ghost"
                      style={{ padding: "0.25rem", borderRadius: "50%" }}
                      title="Play Again"
                    >
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
              <div className="vp-switch-track vp-switch-track--danger">
                <div className="vp-switch-thumb" />
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

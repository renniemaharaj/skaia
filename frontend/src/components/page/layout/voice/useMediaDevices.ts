import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export function getMicrophoneErrorMessage(err: unknown): string {
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

interface UseMediaDevicesProps {
  canSpeak: boolean;
  ensureAudioGraph: () => { audioContext: AudioContext | null; gainNode: GainNode | null };
  broadcastTracks: (stream: MediaStream) => void;
  removeTracks: (stream: MediaStream) => void;
}

export function useMediaDevices({
  canSpeak,
  ensureAudioGraph,
  broadcastTracks,
  removeTracks,
}: UseMediaDevicesProps) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");

  const [micActive, setMicActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

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

  return {
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
  };
}

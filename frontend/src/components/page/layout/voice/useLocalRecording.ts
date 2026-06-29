import { useEffect, useRef } from "react";
import type { WebRTCStream } from "../../../../lib/webrtc/WebRTCManager";

export function useLocalRecording(
  isRecording: boolean,
  screenStream: MediaStream | null,
  localMicStream: MediaStream | null,
  localCameraStream: MediaStream | null,
  remoteStreams: WebRTCStream[]
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  // Handle source nodes connecting/disconnecting dynamically
  useEffect(() => {
    if (!isRecording || !audioContextRef.current || !destNodeRef.current) return;

    const ctx = audioContextRef.current;
    const dest = destNodeRef.current;
    const currentSources = sourceNodesRef.current;
    const nextSources = new Map<string, MediaStreamAudioSourceNode>();

    // Helper to connect a stream
    const connectStream = (id: string, stream: MediaStream) => {
      if (stream.getAudioTracks().length === 0) return;
      if (currentSources.has(id)) {
        nextSources.set(id, currentSources.get(id)!);
      } else {
        try {
          const source = ctx.createMediaStreamSource(stream);
          source.connect(dest);
          nextSources.set(id, source);
        } catch (e) {
          console.warn("Could not connect audio stream to recording", e);
        }
      }
    };

    // Connect local mic
    if (localMicStream) {
      connectStream("local-mic", localMicStream);
    }

    // Connect remote streams
    remoteStreams.forEach(rs => {
      connectStream(`remote-${rs.peerId}`, rs.stream);
    });

    // Disconnect old sources not present anymore
    currentSources.forEach((node, id) => {
      if (!nextSources.has(id)) {
        node.disconnect();
      }
    });

    sourceNodesRef.current = nextSources;
  }, [isRecording, localMicStream, remoteStreams]);

  useEffect(() => {
    if (isRecording && screenStream && !mediaRecorderRef.current) {
      chunksRef.current = [];
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      audioContextRef.current = ctx;
      destNodeRef.current = dest;

      // Mix video and audio
      const mixedStream = new MediaStream();
      screenStream.getVideoTracks().forEach(t => mixedStream.addTrack(t));
      dest.stream.getAudioTracks().forEach(t => mixedStream.addTrack(t));

      const recorder = new MediaRecorder(mixedStream, {
        mimeType: "video/webm;codecs=vp8,opus",
      });

      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);

        // Use modern file picker if available, fallback to a link
        if ((window as any).showSaveFilePicker) {
          (window as any)
            .showSaveFilePicker({
              suggestedName: `meeting-recording-${new Date().toISOString().slice(0, 10)}.webm`,
              types: [
                {
                  description: "WebM Video",
                  accept: { "video/webm": [".webm"] },
                },
              ],
            })
            .then(async (handle: any) => {
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
              URL.revokeObjectURL(url);
            })
            .catch((err: any) => {
              if (err.name !== "AbortError") {
                console.error("Error saving file:", err);
              }
              URL.revokeObjectURL(url);
            });
        } else {
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `meeting-recording-${new Date().toISOString().slice(0, 10)}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } else if (!isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;

      sourceNodesRef.current.forEach(node => node.disconnect());
      sourceNodesRef.current.clear();

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      destNodeRef.current = null;
    }
  }, [isRecording, screenStream]);

  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (isRecording && localCameraStream && !cameraRecorderRef.current) {
      cameraChunksRef.current = [];
      const recorder = new MediaRecorder(localCameraStream, {
        mimeType: "video/webm;codecs=vp8",
      });

      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          cameraChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(cameraChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);

        if ((window as any).showSaveFilePicker) {
          (window as any)
            .showSaveFilePicker({
              suggestedName: `camera-recording-${new Date().toISOString().slice(0, 10)}.webm`,
              types: [
                {
                  description: "WebM Video",
                  accept: { "video/webm": [".webm"] },
                },
              ],
            })
            .then(async (handle: any) => {
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
              URL.revokeObjectURL(url);
            })
            .catch((err: any) => {
              if (err.name !== "AbortError") {
                console.error("Error saving camera file:", err);
              }
              URL.revokeObjectURL(url);
            });
        } else {
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `camera-recording-${new Date().toISOString().slice(0, 10)}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        }
      };

      recorder.start(1000);
      cameraRecorderRef.current = recorder;
    } else if ((!isRecording || !localCameraStream) && cameraRecorderRef.current) {
      cameraRecorderRef.current.stop();
      cameraRecorderRef.current = null;
    }
  }, [isRecording, localCameraStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (cameraRecorderRef.current && cameraRecorderRef.current.state !== "inactive") {
        cameraRecorderRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
}

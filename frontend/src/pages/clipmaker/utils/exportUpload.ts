import { apiRequest } from "../../../utils/api";

export type ExportUpload = {
  saved: boolean;
  temporary?: boolean;
  url?: string;
  download_url?: string;
  filename: string;
  size: number;
  type: string;
  expires_at?: string;
  quota_error?: string;
};

export type VideoSettingsLike = {
  fps?: number;
  resolution?: { width?: number; height?: number };
};

const authHeaders = (): Record<string, string> => {
  let token = localStorage.getItem("auth.accessToken");
  if (token?.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchAudioSource = (src: string, apiBaseUrl: string, signal: AbortSignal) => {
  const sourceUrl = new URL(src, window.location.href);
  const apiUrl = new URL(apiBaseUrl || window.location.origin, window.location.href);
  const headers = sourceUrl.origin === apiUrl.origin ? authHeaders() : undefined;
  return fetch(sourceUrl, { headers, signal });
};

export const uploadRecording = async (
  recording: Blob,
  videoSettings: VideoSettingsLike,
  signal: AbortSignal
) => {
  const filename = `clip-${Date.now()}.mp4`;
  const formData = new FormData();
  formData.append("recording", recording, "recording.webm");
  formData.append("filename", filename);
  formData.append("fps", String(videoSettings.fps || 30));
  formData.append("width", String(videoSettings.resolution?.width || 1920));
  formData.append("height", String(videoSettings.resolution?.height || 1080));

  console.log({
    size: recording.size,
    type: recording.type,
  });

  const header = new Uint8Array(await recording.slice(0, 32).arrayBuffer());

  console.log([...header].map(b => b.toString(16).padStart(2, "0")).join(" "));
  return apiRequest<ExportUpload>("/clipmaker/export", {
    method: "POST",
    body: formData,
    signal,
  });
};

export type StreamFramesOptions = {
  apiBaseUrl: string;
  fps: number;
  durationSeconds: number;
  width: number;
  height: number;
  project?: unknown;
  renderFrame: (frameIndex: number, frameTimeSeconds: number) => Promise<void>;
  captureFrame: () => Promise<Blob>;
  signal: AbortSignal;
};

type ProjectAudioTrack = {
  src: string;
  startSeconds: number;
  endSeconds: number;
  trimSeconds: number;
  playbackRate: number;
  volume: number;
};

const projectAudioTracks = (project: any, durationSeconds: number): ProjectAudioTrack[] => {
  const input = project?.input ?? project;
  const tracks = Array.isArray(input?.tracks) ? input.tracks : [];
  const audio: ProjectAudioTrack[] = [];

  for (const track of tracks) {
    const elements = Array.isArray(track?.elements) ? track.elements : [];
    for (const element of elements) {
      if (element?.type !== "audio" && element?.type !== "video") continue;
      if (element?.props?.play === false) continue;
      const src = typeof element?.props?.src === "string" ? element.props.src.trim() : "";
      const startSeconds = Number(element?.s);
      const endSeconds = Math.min(Number(element?.e), durationSeconds);
      if (!src || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
      if (startSeconds < 0 || endSeconds <= startSeconds) continue;

      const trimSeconds = Number(element?.props?.time ?? 0);
      const playbackRate = Number(element?.props?.playbackRate ?? 1);
      const volume = Number(element?.props?.volume ?? 1);
      audio.push({
        src,
        startSeconds,
        endSeconds,
        trimSeconds: Number.isFinite(trimSeconds) && trimSeconds >= 0 ? trimSeconds : 0,
        playbackRate:
          Number.isFinite(playbackRate) && playbackRate >= 0.25 && playbackRate <= 4
            ? playbackRate
            : 1,
        volume: Number.isFinite(volume) && volume >= 0 && volume <= 4 ? volume : 1,
      });
    }
  }

  return audio.slice(0, 32);
};

export const streamFrameExport = async ({
  apiBaseUrl,
  fps,
  durationSeconds,
  width,
  height,
  project,
  renderFrame,
  captureFrame,
  signal,
}: StreamFramesOptions) => {
  const filename = `clip-${Date.now()}.mp4`;
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * fps));
  const encoder = new TextEncoder();
  const audioTracks = projectAudioTracks(project, durationSeconds);

  const writeFrameStream = async (enqueue: (chunk: Uint8Array) => void) => {
    const enqueueLine = (value: unknown) => {
      enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    };

    enqueueLine({
      type: "meta",
      filename,
      fps,
      width,
      height,
      duration_seconds: durationSeconds,
      total_frames: totalFrames,
      audio_tracks: audioTracks.length,
    });

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (signal.aborted) {
        throw new DOMException("Export was cancelled", "AbortError");
      }

      const frameTimeSeconds = Math.min(frameIndex / fps, durationSeconds);
      await renderFrame(frameIndex, frameTimeSeconds);
      const blob = await captureFrame();
      const bytes = new Uint8Array(await blob.arrayBuffer());

      enqueueLine({
        type: "frame",
        index: frameIndex,
        time_seconds: frameTimeSeconds,
        content_type: blob.type || "image/png",
        byte_length: bytes.byteLength,
      });
      enqueue(bytes);
      enqueue(encoder.encode("\n"));
    }

    for (let audioIndex = 0; audioIndex < audioTracks.length; audioIndex += 1) {
      if (signal.aborted) throw new DOMException("Export was cancelled", "AbortError");
      const track = audioTracks[audioIndex];
      const response = await fetchAudioSource(track.src, apiBaseUrl, signal);
      if (!response.ok) throw new Error(`Could not load audio track ${audioIndex + 1}`);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());

      enqueueLine({
        type: "audio",
        index: audioIndex,
        start_seconds: track.startSeconds,
        end_seconds: track.endSeconds,
        trim_seconds: track.trimSeconds,
        playback_rate: track.playbackRate,
        volume: track.volume,
        content_type: blob.type || "application/octet-stream",
        byte_length: bytes.byteLength,
      });
      enqueue(bytes);
      enqueue(encoder.encode("\n"));
    }
  };

  const createStreamingBody = () =>
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await writeFrameStream(chunk => controller.enqueue(chunk));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        signal.throwIfAborted?.();
      },
    });

  const createBufferedBody = async () => {
    const chunks: ArrayBuffer[] = [];
    await writeFrameStream(chunk => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      chunks.push(copy.buffer);
    });
    return new Blob(chunks, { type: "application/octet-stream" });
  };

  const postFrameStream = async (body: BodyInit, streaming: boolean) => {
    const init: RequestInit & { duplex?: "half" } = {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
      },
      body,
      signal,
    };

    if (streaming) {
      // Chromium requires this for streaming request bodies.
      init.duplex = "half";
    }

    return fetch(`${apiBaseUrl}/clipmaker/export/frames`, init);
  };

  let response: Response;
  try {
    response = await postFrameStream(createStreamingBody() as BodyInit, true);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    response = await postFrameStream(await createBufferedBody(), false);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data?.error || data?.message || message;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as ExportUpload;
};

export const downloadExport = async (apiBaseUrl: string, downloadUrl: string, filename: string) => {
  const response = await fetch(`${apiBaseUrl}${downloadUrl}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error("Temporary export download failed");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "clip.mp4";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

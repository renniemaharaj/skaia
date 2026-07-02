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
  return apiRequest<ExportUpload>("/clip-maker/export", {
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

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueueLine = (value: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };

      try {
        enqueueLine({
          type: "meta",
          filename,
          fps,
          width,
          height,
          duration_seconds: durationSeconds,
          total_frames: totalFrames,
          project,
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
          controller.enqueue(bytes);
          controller.enqueue(encoder.encode("\n"));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      signal.throwIfAborted?.();
    },
  });

  const response = await fetch(`${apiBaseUrl}/clip-maker/export/frames`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/x-skaia-frame-stream",
    },
    body,
    signal,
    // Chromium requires this for streaming request bodies.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

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

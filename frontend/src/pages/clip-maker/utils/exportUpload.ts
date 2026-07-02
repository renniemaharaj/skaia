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

export const uploadRecording = (
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

  return apiRequest<ExportUpload>("/clip-maker/export", {
    method: "POST",
    body: formData,
    signal,
  });
};

export const downloadExport = async (apiBaseUrl: string, downloadUrl: string, filename: string) => {
  let token = localStorage.getItem("auth.accessToken");
  if (token?.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);

  const response = await fetch(`${apiBaseUrl}${downloadUrl}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

import { apiRequest } from "./api";

interface UploadResponse {
  url: string;
  filename: string;
  size: number;
  type: string;
}

/**
 * Upload a file to the server via the TipTap editor upload endpoints.
 * Returns the public URL of the uploaded file.
 *
 * @param file - The file to upload
 * @param type - "image" | "video" | "file"
 */
export async function uploadEditorFile(
  file: File,
  type: "image" | "video" | "file",
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await apiRequest<UploadResponse>(`/upload/${type}`, {
    method: "POST",
    body: fd,
  });

  if (!res?.url) {
    throw new Error("Upload failed: no URL returned");
  }

  return res.url;
}

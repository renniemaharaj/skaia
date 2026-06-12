import { uploader } from "../atoms/uploadAtom";

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
  const res = await uploader.upload(file, { uploadType: type });

  if (!res?.url) {
    throw new Error("Upload failed: no URL returned");
  }

  return res.url;
}

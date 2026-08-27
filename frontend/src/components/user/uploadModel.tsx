import { FileIcon, Film, ImageIcon } from "lucide-react";

export interface UserUpload {
  url: string;
  filename: string;
  size: number;
  type: string;
  mime_type: string;
  created_at: string;
}

export interface UserStorageInfo {
  user_used: number;
  user_limit: number;
  user_percent: number;
  total_used: number;
  total_limit: number;
  total_percent: number;
  user_used_human: string;
  user_limit_human: string;
  total_used_human: string;
  total_limit_human: string;
}

export function formatUploadSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const isImageUpload = (upload: UserUpload) =>
  upload.mime_type.startsWith("image/") ||
  upload.type === "images" ||
  upload.type === "photos" ||
  upload.type === "banners";

export const isVideoUpload = (upload: UserUpload) =>
  upload.mime_type.startsWith("video/") || upload.type === "videos";

export function uploadTypeIcon(upload: UserUpload) {
  if (isImageUpload(upload)) return <ImageIcon size={14} />;
  if (isVideoUpload(upload)) return <Film size={14} />;
  return <FileIcon size={14} />;
}

export function uploadTypeLabel(type: string) {
  const labels: Record<string, string> = {
    images: "Image",
    photos: "Avatar",
    banners: "Banner",
    videos: "Video",
    files: "File",
  };
  return labels[type] ?? type;
}

export function storageBarClass(percent: number) {
  if (percent >= 80) return "up-storage-bar-fill up-storage-danger";
  if (percent >= 50) return "up-storage-bar-fill up-storage-warning";
  return "up-storage-bar-fill up-storage-ok";
}

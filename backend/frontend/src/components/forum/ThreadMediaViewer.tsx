import { useMemo, useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { currentThreadAtom } from "../../atoms/forum";
import { ImageIcon } from "lucide-react";
import "../user/UserProfile.css";
import "./ThreadMediaViewer.css";
import UserUploads from "../user/UserUploads";

interface ParsedMedia {
  url: string;
  type: "images" | "videos" | "file";
}

interface MediaMeta {
  size: number;
  date: string;
}

const ThreadMediaViewer = () => {
  const currentThread = useAtomValue(currentThreadAtom);
  const [metadata, setMetadata] = useState<Record<string, MediaMeta>>({});

  // Parse HTML to extract media
  const rawMediaItems = useMemo(() => {
    if (!currentThread?.content) return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentThread.content, "text/html");
    const items: ParsedMedia[] = [];

    // Extract images
    const imgs = doc.querySelectorAll("img");
    imgs.forEach(img => {
      const src = img.getAttribute("src");
      if (src && !src.includes("data:image/svg+xml")) {
        items.push({ url: src, type: "images" });
      }
    });

    // Extract videos
    const videos = doc.querySelectorAll("video, iframe");
    videos.forEach(video => {
      const src = video.getAttribute("src") || video.querySelector("source")?.getAttribute("src");
      // If it's an iframe, we only want internal uploads. If it's a video tag, we can take it.
      if (src && (src.startsWith("/uploads/") || video.tagName.toLowerCase() === "video")) {
        items.push({ url: src, type: "videos" });
      }
    });

    // Extract attachments
    const attachments = doc.querySelectorAll(".attachment, [data-type='attachment']");
    attachments.forEach(attachment => {
      const a = attachment.querySelector("a");
      const url =
        a?.getAttribute("href") ||
        attachment.getAttribute("data-url") ||
        attachment.getAttribute("src");
      if (url && url !== "#") {
        items.push({ url, type: "file" });
      }
    });

    // Remove duplicates
    const unique = new Map<string, ParsedMedia>();
    items.forEach(i => unique.set(i.url, i));
    return Array.from(unique.values());
  }, [currentThread?.content]);

  // Fetch metadata via HEAD request
  useEffect(() => {
    rawMediaItems.forEach(m => {
      if (m.url.startsWith("/uploads/") && !metadata[m.url]) {
        fetch(m.url, { method: "HEAD" })
          .then(res => {
            if (res.ok) {
              const size = parseInt(res.headers.get("content-length") || "0", 10);
              const date = res.headers.get("last-modified") || new Date().toISOString();
              setMetadata(prev => ({ ...prev, [m.url]: { size, date } }));
            }
          })
          .catch(() => {});
      }
    });
  }, [rawMediaItems, metadata]);

  const transformedUploads = useMemo(() => {
    return rawMediaItems.map(m => {
      const meta = metadata[m.url];
      return {
        url: m.url,
        filename: m.url.split("/").pop() || m.url,
        size: meta?.size || 0,
        type: m.type,
        mime_type:
          m.type === "images"
            ? "image/jpeg"
            : m.type === "videos"
              ? "video/mp4"
              : "application/octet-stream",
        created_at: meta?.date || new Date().toISOString(),
      };
    });
  }, [rawMediaItems, metadata]);

  const emptyMessage = (
    <p className="up-empty-hint" style={{ padding: "1rem 0" }}>
      Upload content to this thread to preview them here.
    </p>
  );

  const title = (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <ImageIcon size={18} />
      Thread Media
      <span className="up-uploads-count">{transformedUploads.length}</span>
    </div>
  );

  return (
    <div
      className="card up-uploads-section tmv-container"
      style={{ marginBottom: "1.5rem", padding: 0, border: "none" }}
    >
      <UserUploads
        userId={String(currentThread?.user_id)}
        displayName={currentThread?.user_name || "Thread"}
        hideHeader={false}
        externalUploads={transformedUploads}
        title={title}
        emptyMessage={emptyMessage}
      />
    </div>
  );
};

export default ThreadMediaViewer;

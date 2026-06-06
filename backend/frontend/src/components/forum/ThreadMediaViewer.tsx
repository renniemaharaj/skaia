import { useMemo, useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { currentThreadAtom } from "../../atoms/forum";
import { ImageIcon } from "lucide-react";
import "../../pages/users/UserProfile.css";
import "./ThreadMediaViewer.css";
import UserUploads from "../../pages/users/UserUploads";

interface ParsedMedia {
  url: string;
  type: "images" | "videos";
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
    imgs.forEach((img) => {
      const src = img.getAttribute("src");
      if (src && !src.includes("data:image/svg+xml")) {
        items.push({ url: src, type: "images" });
      }
    });

    // Extract videos
    const videos = doc.querySelectorAll("video");
    videos.forEach((video) => {
      const src = video.getAttribute("src") || video.querySelector("source")?.getAttribute("src");
      if (src) {
        items.push({ url: src, type: "videos" });
      }
    });

    // Remove duplicates
    const unique = new Map<string, ParsedMedia>();
    items.forEach(i => unique.set(i.url, i));
    return Array.from(unique.values());
  }, [currentThread?.content]);

  // Fetch metadata via HEAD request
  useEffect(() => {
    rawMediaItems.forEach((m) => {
      if (m.url.startsWith('/uploads/') && !metadata[m.url]) {
        fetch(m.url, { method: "HEAD" }).then(res => {
          if (res.ok) {
            const size = parseInt(res.headers.get("content-length") || "0", 10);
            const date = res.headers.get("last-modified") || new Date().toISOString();
            setMetadata(prev => ({ ...prev, [m.url]: { size, date } }));
          }
        }).catch(() => {});
      }
    });
  }, [rawMediaItems, metadata]);

  const transformedUploads = useMemo(() => {
    return rawMediaItems.map(m => {
      const meta = metadata[m.url];
      return {
        url: m.url,
        filename: m.url.split('/').pop() || m.url,
        size: meta?.size || 0,
        type: m.type,
        mime_type: m.type === "images" ? "image/jpeg" : "video/mp4",
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
    <div className="card up-uploads-section tmv-container" style={{ marginBottom: "1.5rem", padding: 0, border: "none" }}>
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

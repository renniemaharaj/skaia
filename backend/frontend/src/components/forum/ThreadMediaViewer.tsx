import { useMemo, useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { currentThreadAtom } from "../../atoms/forum";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import { ImageIcon, Film, X, Copy, Check, Trash2 } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { customConfirm } from "../../components/ui/Prompt";
import "../../pages/users/UserProfile.css";
import "./ThreadMediaViewer.css";

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
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const isThreadAuthor = currentThread?.user_id === currentUser?.id;
  const canManage = hasPermission("user.manage-others");
  const canDelete = isThreadAuthor || canManage;

  const [selectedUpload, setSelectedUpload] = useState<ParsedMedia | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deletingSet, setDeletingSet] = useState<Set<string>>(new Set());
  const [deletedUrls, setDeletedUrls] = useState<Set<string>>(new Set());
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

  const mediaItems = rawMediaItems.filter(m => !deletedUrls.has(m.url));

  // Fetch metadata via HEAD request
  useEffect(() => {
    mediaItems.forEach((m) => {
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
  }, [mediaItems, metadata]);

  const handleCopyUrl = (url: string) => {
    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  };

  const handleDelete = async (url: string) => {
    if (!await customConfirm("Delete this upload permanently?")) return;
    setDeletingSet((prev) => new Set(prev).add(url));
    try {
      await apiRequest("/upload/file", {
        method: "DELETE",
        body: JSON.stringify({ url }),
      });
      setDeletedUrls((prev) => new Set(prev).add(url));
      if (selectedUpload?.url === url) setSelectedUpload(null);
    } catch {
      alert("Failed to delete upload. Ensure it is your upload or you have permissions.");
    } finally {
      setDeletingSet((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const getFilename = (url: string) => {
    try {
      const parts = new URL(url, window.location.origin).pathname.split("/");
      return parts[parts.length - 1] || "media";
    } catch {
      return "media";
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Unknown date";
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (!mediaItems.length) {
    return (
      <div className="card up-uploads-section tmv-empty" style={{ marginBottom: "1.5rem" }}>
        <h2 className="up-section-heading" style={{ margin: 0, paddingBottom: "0.5rem" }}>
          <ImageIcon size={18} />
          Thread Media
        </h2>
        <p className="up-empty-hint" style={{ padding: "1rem 0" }}>Upload content to this thread to preview them here.</p>
      </div>
    );
  }

  return (
    <div className="card up-uploads-section tmv-container" style={{ marginBottom: "1.5rem" }}>
      <h2 className="up-section-heading">
        <ImageIcon size={18} />
        Thread Media
        <span className="up-uploads-count">{mediaItems.length}</span>
      </h2>

      <div className="up-uploads-scroll">
        <div className="up-uploads-grid">
          {mediaItems.map((u, i) => (
            <div
              key={`${u.url}-${i}`}
              className={`up-upload-card${deletingSet.has(u.url) ? " up-upload-deleting" : ""}${selectedUpload?.url === u.url ? " up-upload-selected" : ""}`}
            >
              <div
                className="up-upload-thumb"
                onClick={() => setSelectedUpload(selectedUpload?.url === u.url ? null : u)}
              >
                {u.type === "images" ? (
                  <img src={u.url} alt="Thread media" loading="lazy" />
                ) : (
                  <video src={u.url} muted preload="metadata" />
                )}
                <span className="up-upload-type-badge">
                  {u.type === "images" ? <ImageIcon size={14} /> : <Film size={14} />} {u.type === "images" ? "Image" : "Video"}
                </span>
              </div>

              <div className="up-upload-info">
                <span className="up-upload-filename" title={getFilename(u.url)}>
                  {getFilename(u.url)}
                </span>
                <span className="up-upload-meta">
                  {metadata[u.url] ? (
                    <>{formatSize(metadata[u.url].size)} · {formatDate(metadata[u.url].date)}</>
                  ) : (
                    "Loading..."
                  )}
                </span>
              </div>

              <div className="thread-actions">
                <button
                  className="thread-action-btn copy-btn"
                  title="Copy URL"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyUrl(u.url);
                  }}
                >
                  {copiedUrl === u.url ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {canDelete && (
                  <button
                    className="thread-action-btn delete-btn"
                    title="Delete"
                    disabled={deletingSet.has(u.url)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(u.url);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedUpload && selectedUpload.type === "images" && (
        <div className="up-upload-lightbox" onClick={() => setSelectedUpload(null)}>
          <div className="up-upload-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedUpload.url} alt="Preview" />
            <div className="up-upload-lightbox-bar">
              <span className="up-upload-lightbox-name">
                {getFilename(selectedUpload.url)}
              </span>
              <div className="thread-actions">
                <button
                  className="thread-action-btn copy-btn"
                  title="Copy URL"
                  onClick={() => handleCopyUrl(selectedUpload.url)}
                >
                  {copiedUrl === selectedUpload.url ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {canDelete && (
                  <button
                    className="thread-action-btn delete-btn"
                    title="Delete"
                    disabled={deletingSet.has(selectedUpload.url)}
                    onClick={() => handleDelete(selectedUpload.url)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  className="thread-action-btn view-btn"
                  title="Close"
                  onClick={() => setSelectedUpload(null)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreadMediaViewer;

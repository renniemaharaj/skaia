import { useState, useEffect, useCallback } from "react";
import { useAtomValue } from "jotai";
import {
  ImageIcon,
  Trash2,
  Copy,
  Check,
  Film,
  FileIcon,
  AlertCircle,
  X,
} from "lucide-react";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import "../../components/forum/ThreadActions.css";

interface UserUpload {
  url: string;
  filename: string;
  size: number;
  type: string;
  mime_type: string;
  created_at: string;
}

interface UserStorageInfo {
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

interface Props {
  userId: string | undefined;
  displayName: string;
}

const UserUploads = ({ userId, displayName }: Props) => {
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  const isOwnProfile = String(currentUser?.id) === String(userId);
  const canManage = hasPermission("user.manage-others");
  const canDelete = isOwnProfile || canManage;

  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSet, setDeletingSet] = useState<Set<string>>(new Set());
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<UserUpload | null>(null);
  const [storageInfo, setStorageInfo] = useState<UserStorageInfo | null>(null);

  const fetchUploads = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await apiRequest<UserUpload[]>(`/upload/user/${userId}`);
      setUploads(data ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  // Fetch storage info.
  const fetchStorage = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await apiRequest<UserStorageInfo>(
        `/upload/storage/${userId}`,
      );
      setStorageInfo(data ?? null);
    } catch {
      // non-critical
    }
  }, [userId]);

  useEffect(() => {
    fetchStorage();
  }, [fetchStorage]);

  const handleDelete = useCallback(
    async (url: string) => {
      if (!confirm("Delete this upload permanently?")) return;
      setDeletingSet((prev) => new Set(prev).add(url));
      try {
        await apiRequest("/upload/file", {
          method: "DELETE",
          body: JSON.stringify({ url }),
        });
        setUploads((prev) => prev.filter((u) => u.url !== url));
        if (selectedUpload?.url === url) setSelectedUpload(null);
      } catch {
        alert("Failed to delete upload");
      } finally {
        setDeletingSet((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      }
    },
    [selectedUpload],
  );

  const handleCopyUrl = useCallback((url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isImage = (u: UserUpload) =>
    u.mime_type.startsWith("image/") ||
    u.type === "images" ||
    u.type === "photos" ||
    u.type === "banners";

  const isVideo = (u: UserUpload) =>
    u.mime_type.startsWith("video/") || u.type === "videos";

  const getTypeIcon = (u: UserUpload) => {
    if (isImage(u)) return <ImageIcon size={14} />;
    if (isVideo(u)) return <Film size={14} />;
    return <FileIcon size={14} />;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "images":
        return "Image";
      case "photos":
        return "Avatar";
      case "banners":
        return "Banner";
      case "videos":
        return "Video";
      case "files":
        return "File";
      default:
        return type;
    }
  };

  const storageBarClass = (pct: number) => {
    if (pct >= 80) return "up-storage-bar-fill up-storage-danger";
    if (pct >= 50) return "up-storage-bar-fill up-storage-warning";
    return "up-storage-bar-fill up-storage-ok";
  };

  const StorageBar = () => {
    if (!storageInfo || storageInfo.user_limit <= 0) return null;
    return (
      <div className="up-storage-info">
        <div className="up-storage-header">
          <span className="up-storage-label">Storage</span>
          <span className="up-storage-value">
            {storageInfo.user_used_human} / {storageInfo.user_limit_human}
          </span>
        </div>
        <div className="up-storage-bar">
          <div
            className={storageBarClass(storageInfo.user_percent)}
            style={{ width: `${Math.min(storageInfo.user_percent, 100)}%` }}
          />
        </div>
        {storageInfo.user_percent >= 80 && (
          <span className="up-storage-warning-text">
            {storageInfo.user_percent >= 95
              ? "Upload quota nearly full!"
              : "Approaching upload limit"}
          </span>
        )}
      </div>
    );
  };

  // Filter to only show images/media by default
  const imageUploads = uploads.filter((u) => isImage(u) || isVideo(u));
  const fileUploads = uploads.filter((u) => !isImage(u) && !isVideo(u));

  if (loading) {
    return (
      <div className="up-uploads-section">
        <h2 className="up-section-heading">
          <ImageIcon size={18} />
          Uploads
        </h2>
        <div className="up-uploads-loading">
          <span className="up-spinner" /> Loading uploads…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="up-uploads-section">
        <h2 className="up-section-heading">
          <ImageIcon size={18} />
          Uploads
        </h2>
        <p className="up-uploads-error">
          <AlertCircle size={14} /> {error}
        </p>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="up-uploads-section">
        <h2 className="up-section-heading">
          <ImageIcon size={18} />
          Uploads by {displayName}
        </h2>
        <StorageBar />
        <p className="up-empty-hint">No uploads yet</p>
      </div>
    );
  }

  return (
    <div className="up-uploads-section">
      <h2 className="up-section-heading">
        <ImageIcon size={18} />
        Uploads by {displayName}
        <span className="up-uploads-count">{uploads.length}</span>
      </h2>

      <StorageBar />

      {/* Image/Video grid */}
      {imageUploads.length > 0 && (
        <div className="up-uploads-scroll">
          <div className="up-uploads-grid">
            {imageUploads.map((u) => (
              <div
                key={u.url}
                className={`up-upload-card${deletingSet.has(u.url) ? " up-upload-deleting" : ""}${selectedUpload?.url === u.url ? " up-upload-selected" : ""}`}
              >
                <div
                  className="up-upload-thumb"
                  onClick={() =>
                    setSelectedUpload(selectedUpload?.url === u.url ? null : u)
                  }
                >
                  {isImage(u) ? (
                    <img src={u.url} alt={u.filename} loading="lazy" />
                  ) : isVideo(u) ? (
                    <video src={u.url} muted preload="metadata" />
                  ) : null}
                  <span className="up-upload-type-badge">
                    {getTypeIcon(u)} {getTypeLabel(u.type)}
                  </span>
                </div>

                <div className="up-upload-info">
                  <span className="up-upload-filename" title={u.filename}>
                    {u.filename}
                  </span>
                  <span className="up-upload-meta">
                    {formatSize(u.size)} · {formatDate(u.created_at)}
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
                    {copiedUrl === u.url ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
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
      )}

      {/* File list */}
      {fileUploads.length > 0 && (
        <>
          <h3 className="up-uploads-subheading">Files</h3>
          <div className="up-uploads-file-list">
            {fileUploads.map((u) => (
              <div
                key={u.url}
                className={`up-upload-file-row${deletingSet.has(u.url) ? " up-upload-deleting" : ""}`}
              >
                <FileIcon size={16} className="up-upload-file-icon" />
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="up-upload-file-name"
                  title={u.filename}
                >
                  {u.filename}
                </a>
                <span className="up-upload-file-meta">
                  {formatSize(u.size)} · {formatDate(u.created_at)}
                </span>
                <div className="thread-actions">
                  <button
                    className="thread-action-btn copy-btn"
                    title="Copy URL"
                    onClick={() => handleCopyUrl(u.url)}
                  >
                    {copiedUrl === u.url ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                  {canDelete && (
                    <button
                      className="thread-action-btn delete-btn"
                      title="Delete"
                      disabled={deletingSet.has(u.url)}
                      onClick={() => handleDelete(u.url)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lightbox preview */}
      {selectedUpload && isImage(selectedUpload) && (
        <div
          className="up-upload-lightbox"
          onClick={() => setSelectedUpload(null)}
        >
          <div
            className="up-upload-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={selectedUpload.url} alt={selectedUpload.filename} />
            <div className="up-upload-lightbox-bar">
              <span className="up-upload-lightbox-name">
                {selectedUpload.filename}
              </span>
              <div className="thread-actions">
                <button
                  className="thread-action-btn copy-btn"
                  title="Copy URL"
                  onClick={() => handleCopyUrl(selectedUpload.url)}
                >
                  {copiedUrl === selectedUpload.url ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
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

export default UserUploads;

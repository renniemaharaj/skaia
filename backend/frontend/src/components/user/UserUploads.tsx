import { customConfirm } from "../ui/Prompt";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAtomValue, useSetAtom } from "jotai";
import {
 ImageIcon,
 Trash2,
 Copy,
 Check,
 Film,
 FileIcon,
 AlertCircle,
 X,
 Download,
 LayoutGrid,
 List,
 ExternalLink,
 Upload,
 UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { uploader, showUploadManagerAtom } from "../../atoms/uploadAtom";
import { TableView } from "../ui/TableView/TableView";

import "../page/layout/templates/DirectoryLayout.css";

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
 hideHeader?: boolean;
 externalViewMode?: "grid" | "list";
 externalSearch?: string;
 externalUploads?: UserUpload[];
 title?: React.ReactNode;
 emptyMessage?: React.ReactNode;
}

const UserUploads = ({ userId, displayName, hideHeader, externalViewMode, externalSearch, externalUploads, title, emptyMessage }: Props) => {
 const currentUser = useAtomValue(currentUserAtom);
 const hasPermission = useAtomValue(hasPermissionAtom);
 const setShowManager = useSetAtom(showUploadManagerAtom);

 const isOwnProfile = String(currentUser?.id) === String(userId);
 const canManage = hasPermission("user.manage-others");
 const canDelete = isOwnProfile || canManage;

 const [uploads, setUploads] = useState<UserUpload[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [deletingSet, setDeletingSet] = useState<Set<string>>(new Set());
 const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
 const [selectedUpload, setSelectedUpload] = useState<UserUpload | null>(null);
 const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
 const [lastSelectedUrl, setLastSelectedUrl] = useState<string | null>(null);
 const [storageInfo, setStorageInfo] = useState<UserStorageInfo | null>(null);
 const fileInputRef = useRef<HTMLInputElement>(null);

 const fetchUploads = useCallback(async () => {
 if (externalUploads) {
 setUploads(externalUploads);
 setLoading(false);
 return;
 }
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
 }, [userId, externalUploads]);

 useEffect(() => {
 fetchUploads();
 }, [fetchUploads]);

 useEffect(() => {
 const handler = () => {
 fetchUploads();
 };
 window.addEventListener("user:uploads:changed", handler);
 return () => window.removeEventListener("user:uploads:changed", handler);
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
 if (!await customConfirm("Delete this upload permanently?")) return;
 setDeletingSet((prev) => new Set(prev).add(url));
 try {
 await apiRequest("/upload/file", {
 method: "DELETE",
 body: JSON.stringify({ url }),
 });
 setUploads((prev) => prev.filter((u) => u.url !== url));
 if (selectedUpload?.url === url) setSelectedUpload(null);
 setSelectedItems((prev) => {
 const next = new Set(prev);
 next.delete(url);
 return next;
 });
 fetchStorage();
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
 [selectedUpload, fetchStorage],
 );

 const handleMultiDelete = async () => {
 const urls = Array.from(selectedItems);
 if (urls.length === 0) return;
 if (!await customConfirm(`Delete ${urls.length} upload(s) permanently?`)) return;

 const deleting = new Set(urls);
 setDeletingSet((prev) => new Set([...prev, ...deleting]));

 try {
 await apiRequest("/upload/file", {
 method: "DELETE",
 body: JSON.stringify({ urls }),
 });
 setUploads((prev) => prev.filter((u) => !deleting.has(u.url)));
 if (selectedUpload && deleting.has(selectedUpload.url)) setSelectedUpload(null);
 setSelectedItems(new Set());
 fetchStorage();
 } catch {
 alert("Failed to delete uploads");
 } finally {
 setDeletingSet((prev) => {
 const next = new Set(prev);
 for (const url of deleting) next.delete(url);
 return next;
 });
 }
 };

 const handleSelect = useCallback((url: string, e?: React.MouseEvent | React.ChangeEvent) => {
 e?.stopPropagation();
 
 // Determine the active list
 const filtered = externalSearch
 ? uploads.filter((u) => u.filename.toLowerCase().includes(externalSearch.toLowerCase()))
 : uploads;

 setSelectedItems((prev) => {
 const next = new Set(prev);
 const isShift = (e as React.MouseEvent)?.shiftKey;
 const isCtrl = (e as React.MouseEvent)?.ctrlKey || (e as React.MouseEvent)?.metaKey;
 
 if (isShift && lastSelectedUrl) {
 const allUrls = filtered.map(u => u.url);
 const startIdx = allUrls.indexOf(lastSelectedUrl);
 const endIdx = allUrls.indexOf(url);
 if (startIdx !== -1 && endIdx !== -1) {
 const min = Math.min(startIdx, endIdx);
 const max = Math.max(startIdx, endIdx);
 for (let i = min; i <= max; i++) {
 next.add(allUrls[i]);
 }
 }
 } else if (isCtrl || e?.type === "change") {
 if (next.has(url)) next.delete(url);
 else next.add(url);
 setLastSelectedUrl(url);
 } else {
 if (next.has(url)) next.delete(url);
 else next.add(url);
 setLastSelectedUrl(url);
 }
 return next;
 });
 }, [uploads, externalSearch, lastSelectedUrl]);

 const toggleSelectAll = () => {
 const filtered = externalSearch
 ? uploads.filter((u) => u.filename.toLowerCase().includes(externalSearch.toLowerCase()))
 : uploads;
 
 if (selectedItems.size === filtered.length && filtered.length > 0) {
 setSelectedItems(new Set());
 } else {
 setSelectedItems(new Set(filtered.map(u => u.url)));
 }
 };

 const handleCopyUrl = useCallback((url: string) => {
 const fullUrl = `${window.location.origin}${url}`;
 navigator.clipboard.writeText(fullUrl).then(() => {
 setCopiedUrl(url);
 setTimeout(() => setCopiedUrl(null), 2000);
 });
 }, []);

 const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;

 if (fileInputRef.current) fileInputRef.current.value = "";

 try {
 setLoading(true);
 await uploader.upload(file);
 fetchUploads();
 fetchStorage();
 } catch (err: any) {
 setError(err.message || "Failed to upload file");
 } finally {
 setLoading(false);
 }
 };

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


 const [internalViewMode, setInternalViewMode] = useState<"grid" | "list">("grid");
 const viewMode = externalViewMode || internalViewMode;
 const setViewMode = (m: "grid" | "list") => setInternalViewMode(m);

 // Filter uploads by search
 const filteredUploads = externalSearch
 ? uploads.filter((u) => u.filename.toLowerCase().includes(externalSearch.toLowerCase()))
 : uploads;

 if (loading) {
 return (
 <div className="up-uploads-section">
 {!hideHeader && (
 <h2 className="up-section-heading">
 <ImageIcon size={18} />
 Uploads
 </h2>
 )}
 <div className="up-uploads-loading">
 <span className="up-spinner" /> Loading uploads…
 </div>
 </div>
 );
 }

 if (error) {
 return (
 <div className="up-uploads-section">
 {!hideHeader && (
 <h2 className="up-section-heading">
 <ImageIcon size={18} />
 Uploads
 </h2>
 )}
 <p className="up-uploads-error">
 <AlertCircle size={14} /> {error}
 </p>
 </div>
 );
 }

 if (uploads.length === 0) {
 return (
 <div className="up-uploads-section">
 {!hideHeader && (
 <h2 className="up-section-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
 <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
 <ImageIcon size={18} />
 Uploads by {displayName}
 </div>
 <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
 {isOwnProfile && (
 <>
 <button
 className="action-btn "
 title="Upload File"
 onClick={() => fileInputRef.current?.click()}
 >
 <Upload size={16} />
 </button>
 <button
 className="action-btn "
 title="Toggle Upload Manager"
 onClick={() => setShowManager(prev => !prev)}
 >
 <UploadCloud size={16} />
 </button>
 <input
 type="file"
 ref={fileInputRef}
 style={{ display: "none" }}
 onChange={handleFileUpload}
 />
 </>
 )}
 </div>
 </h2>
 )}
 {!externalUploads && <StorageBar />}
 {emptyMessage ? emptyMessage : <p className="up-empty-hint">No uploads yet</p>}
 </div>
 );
 }

 const handleDownload = (u: UserUpload, e?: React.MouseEvent) => {
 if (e) e.stopPropagation();
 const a = document.createElement("a");
 a.href = u.url;
 a.download = u.filename;
 a.click();
 };

 return (
 <div className="up-uploads-section">
 {!hideHeader && (
 <h2 className="up-section-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
 {title ? title : (
 <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
 <ImageIcon size={18} />
 Uploads by {displayName}
 <span className="up-uploads-count">{uploads.length}</span>
 </div>
 )}
 <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
 {isOwnProfile && (
 <>
 <button
 className="action-btn "
 title="Upload File"
 onClick={() => fileInputRef.current?.click()}
 >
 <Upload size={16} />
 </button>
 <button
 className="action-btn "
 title="Toggle Upload Manager"
 onClick={() => setShowManager(prev => !prev)}
 >
 <UploadCloud size={16} />
 </button>
 <input
 type="file"
 ref={fileInputRef}
 style={{ display: "none" }}
 onChange={handleFileUpload}
 />
 </>
 )}
 {filteredUploads.length > 0 && (
 <>
 <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 4px' }} />
 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
 <input 
 type="checkbox" 
 className="up-checkbox"
 checked={selectedItems.size === filteredUploads.length && filteredUploads.length > 0} 
 onChange={toggleSelectAll} 
 />
 All
 </label>
 </>
 )}
 {selectedItems.size > 0 && canDelete && (
 <button
 className="action-btn danger"
 title={`Delete ${selectedItems.size} selected items`}
 onClick={handleMultiDelete}
 >
 <Trash2 size={16} />
 </button>
 )}
 <Link
 to={`/directory/${userId}`}
 className="action-btn"
 title="Open Full Directory"
 >
 <ExternalLink size={16} />
 </Link>
 <div className="directory-layout__view-toggle">
 <button
 onClick={() => setViewMode("grid")}
 className={`directory-view-btn ${viewMode === "grid" ? "active" : ""}`}
 title="Grid view"
 >
 <LayoutGrid size={16} />
 </button>
 <button
 onClick={() => setViewMode("list")}
 className={`directory-view-btn ${viewMode === "list" ? "active" : ""}`}
 title="List view"
 >
 <List size={16} />
 </button>
 </div>
 </div>
 </h2>
 )}

 {!hideHeader && !externalUploads && <StorageBar />}

 <div style={{ 
 backgroundColor: "var(--bg-tertiary)", 
 color: "var(--text-secondary)", 
 padding: "12px 16px", 
 borderRadius: "8px", 
 display: "flex", 
 gap: "12px", 
 alignItems: "flex-start", 
 marginBottom: "16px", 
 fontSize: "13px",
 border: "1px solid var(--border-subtle)"
 }}>
 <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--text-warning)" }} />
 <div style={{ lineHeight: "1.5" }}>
 <strong>Disclaimer:</strong> This platform is not liable for what is uploaded by users. Please only download files from trusted users. Additionally, please report any non-conforming content to the site's forum.
 </div>
 </div>

 {viewMode === "grid" ? (
 <div className="up-uploads-scroll">
 <div className="up-uploads-grid">
 {filteredUploads.map((u) => (
 <div
 key={u.url}
 className={`up-upload-card${deletingSet.has(u.url) ? " up-upload-deleting" : ""}${selectedUpload?.url === u.url ? " up-upload-selected" : ""}${selectedItems.has(u.url) ? " up-upload-checked" : ""}`}
 onClick={(e) => {
 if (e.ctrlKey || e.metaKey || e.shiftKey) {
 handleSelect(u.url, e);
 } else {
 setSelectedUpload(selectedUpload?.url === u.url ? null : u);
 }
 }}
 >
 <div
 className="up-upload-thumb"
 style={{
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 backgroundColor: "var(--bg-tertiary)",
 position: "relative"
 }}
 >
 <div style={{ position: "absolute", top: "8px", left: "8px", zIndex: 10 }}>
 <input 
 type="checkbox" 
 className="up-checkbox"
 checked={selectedItems.has(u.url)} 
 onChange={(e) => handleSelect(u.url, e)} 
 onClick={(e) => e.stopPropagation()}
 />
 </div>
 {isImage(u) ? (
 <img src={u.url} alt={u.filename} loading="lazy" />
 ) : isVideo(u) ? (
 <video src={u.url} muted preload="metadata" />
 ) : (
 <FileIcon size={32} color="var(--text-tertiary)" />
 )}
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
 className="action-btn view-btn"
 title="Download"
 onClick={(e) => handleDownload(u, e)}
 >
 <Download size={14} />
 </button>
 <button
 className="action-btn copy-btn"
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
 className="action-btn danger"
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
 ) : (
 <TableView<UserUpload>
 data={filteredUploads}
 renderRowWrapper={(u, _i, rowProps, cells) => (
 <div 
 key={u.url} 
 {...rowProps} 
 className={`${rowProps.className}${selectedItems.has(u.url) ? ' up-upload-checked' : ''}${deletingSet.has(u.url) ? ' up-upload-deleting' : ''}`}
 onClick={(e) => {
 if (e.ctrlKey || e.metaKey || e.shiftKey) {
 handleSelect(u.url, e);
 } else {
 setSelectedUpload(u);
 }
 }}
 >
 {cells}
 </div>
 )}
 columns={[
 {
 header: (
 <input 
 type="checkbox" 
 className="up-checkbox"
 checked={selectedItems.size === filteredUploads.length && filteredUploads.length > 0} 
 onChange={toggleSelectAll} 
 />
 ),
 width: "40px",
 className: "table-view__cell--center",
 cell: (u) => (
 <input 
 type="checkbox" 
 className="up-checkbox"
 checked={selectedItems.has(u.url)} 
 onChange={(e) => handleSelect(u.url, e)} 
 onClick={(e) => e.stopPropagation()}
 />
 )
 },
 {
 header: "File",
 width: "minmax(250px, 3fr)",
 className: "table-view__cell--bold",
 cell: (u) => (
 <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", minWidth: 0, width: "100%" }} onClick={() => setSelectedUpload(u)}>
 {isImage(u) ? (
 <div style={{ width: "32px", height: "32px", borderRadius: "4px", overflow: "hidden", flexShrink: 0 }}>
 <img src={u.url} alt={u.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
 </div>
 ) : isVideo(u) ? (
 <div style={{ width: "32px", height: "32px", borderRadius: "4px", overflow: "hidden", flexShrink: 0, backgroundColor: "black" }}>
 <video src={u.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
 </div>
 ) : (
 <div style={{ width: "32px", height: "32px", borderRadius: "4px", backgroundColor: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
 <FileIcon size={16} color="var(--text-tertiary)" />
 </div>
 )}
 <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
 {u.filename}
 </span>
 </div>
 ),
 },
 {
 header: "Type",
 width: "minmax(120px, 1fr)",
 className: "table-view__cell--muted",
 cell: (u) => (
 <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", minWidth: 0, width: "100%" }}>
 {getTypeIcon(u)} <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getTypeLabel(u.type)}</span>
 </span>
 ),
 },
 {
 header: "Size",
 width: "minmax(80px, 1fr)",
 className: "table-view__cell--muted",
 cell: (u) => formatSize(u.size),
 },
 {
 header: "Date",
 width: "minmax(140px, 1.5fr)",
 className: "table-view__cell--muted",
 cell: (u) => formatDate(u.created_at),
 },
 {
 header: "Actions",
 width: "120px",
 cell: (u) => (
 <div className="thread-actions">
 <button
 className="action-btn view-btn"
 title="Download"
 onClick={(e) => handleDownload(u, e)}
 >
 <Download size={14} />
 </button>
 <button
 className="action-btn copy-btn"
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
 className="action-btn danger"
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
 ),
 },
 ]}
 />
 )}

 {/* Lightbox preview */}
 {selectedUpload && (isImage(selectedUpload) || isVideo(selectedUpload)) && typeof document !== "undefined" && createPortal(
 <div
 className="up-upload-lightbox"
 onClick={() => setSelectedUpload(null)}
 >
 <div
 className="up-upload-lightbox-content"
 onClick={(e) => e.stopPropagation()}
 >
 {isImage(selectedUpload) ? (
 <img src={selectedUpload.url} alt={selectedUpload.filename} />
 ) : (
 <video src={selectedUpload.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh', backgroundColor: '#000' }} />
 )}
 <div className="up-upload-lightbox-bar">
 <span className="up-upload-lightbox-name">
 {selectedUpload.filename}
 </span>
 <div className="thread-actions">
 <button
 className="action-btn view-btn"
 title="Download"
 onClick={() => handleDownload(selectedUpload)}
 >
 <Download size={14} />
 </button>
 <button
 className="action-btn copy-btn"
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
 className="action-btn danger"
 title="Delete"
 disabled={deletingSet.has(selectedUpload.url)}
 onClick={() => handleDelete(selectedUpload.url)}
 >
 <Trash2 size={14} />
 </button>
 )}
 <button
 className="action-btn view-btn"
 title="Close"
 onClick={() => setSelectedUpload(null)}
 >
 <X size={14} />
 </button>
 </div>
 </div>
 </div>
 </div>,
 document.body
 )}
 </div>
 );
};

export default UserUploads;

import { useRef, useState } from "react";
import { Check, Copy, Film, ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import type { ProductMedia } from "../../atoms/store";
import { uploader } from "../../atoms/uploadAtom";
import { TableView } from "../ui/TableView/TableView";
import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";
import "./Store.css";

interface ProductMediaTableProps {
  media: ProductMedia[];
  onChange?: (media: ProductMedia[]) => void;
  editable?: boolean;
}

const isVideo = (item: ProductMedia) =>
  item.mime_type?.startsWith("video/") || item.type === "video";

const formatSize = (bytes: number) => {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const mediaFromUploadResponse = (res: any, file: File): ProductMedia => {
  const mimeType = res?.mime_type || res?.type || file.type || "";
  const mediaType = mimeType.startsWith("video/") ? "video" : "image";
  const url = res?.url || res?.URL || "";
  return {
    url,
    filename: res?.filename || file.name,
    mime_type: mimeType,
    type: mediaType,
    size: Number(res?.size ?? file.size ?? 0),
    created_at: new Date().toISOString(),
  };
};

export function ProductMediaTable({ media, onChange, editable = false }: ProductMediaTableProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!files.length || !onChange) return;

    setUploading(true);
    try {
      const uploaded: ProductMedia[] = [];
      for (const file of files) {
        const type = file.type.startsWith("video/") ? "video" : "image";
        const res = await uploader.upload(file, { uploadType: type });
        const item = mediaFromUploadResponse(res, file);
        if (!item.url) {
          throw new Error("Upload completed without a media URL");
        }
        uploaded.push(item);
      }
      onChange([...media, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const removeItem = (url: string) => {
    onChange?.(media.filter(item => item.url !== url));
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1600);
  };

  return (
    <div className="product-media-table">
      <div className="product-media-table__toolbar">
        <span className="product-media-table__count">
          {media.length} media item{media.length === 1 ? "" : "s"}
        </span>
        {editable && (
          <>
            <button
              type="button"
              className="action-btn"
              title="Add media"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Upload size={14} className="spin" /> : <Plus size={14} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display: "none" }}
              onChange={handleFiles}
            />
          </>
        )}
      </div>

      <TableView<ProductMedia>
        data={media}
        chrome="embedded"
        maxHeight={240}
        rowKey={item => item.url}
        emptyState={<div className="product-media-table__empty">No product media yet</div>}
        renderRowWrapper={(item, index, rowProps, cells) => (
          <div
            key={item.url}
            {...rowProps}
            onClick={() => setPreviewIndex(index)}
            className={`${rowProps.className} product-media-table__row`}
          >
            {cells}
          </div>
        )}
        columns={[
          {
            header: "Media",
            width: "minmax(220px, 3fr)",
            className: "table-view__cell--bold",
            cell: item => (
              <div className="product-media-table__file">
                <div className="product-media-table__thumb">
                  {isVideo(item) ? (
                    <video src={item.url} preload="metadata" />
                  ) : (
                    <img src={item.url} alt={item.filename} loading="lazy" />
                  )}
                </div>
                <span title={item.filename}>{item.filename}</span>
              </div>
            ),
          },
          {
            header: "Type",
            width: "110px",
            className: "table-view__cell--muted",
            cell: item => (
              <span className="product-media-table__type">
                {isVideo(item) ? <Film size={14} /> : <ImageIcon size={14} />}
                {isVideo(item) ? "Video" : "Image"}
              </span>
            ),
          },
          {
            header: "Size",
            width: "90px",
            className: "table-view__cell--muted",
            cell: item => formatSize(item.size),
          },
          {
            header: "Added",
            width: "130px",
            className: "table-view__cell--muted",
            cell: item => formatDate(item.created_at),
          },
          {
            header: "Actions",
            width: editable ? "92px" : "48px",
            cell: item => (
              <div className="table-view__row-actions" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  className="action-btn copy-btn"
                  title="Copy URL"
                  onClick={() => copyUrl(item.url)}
                >
                  {copiedUrl === item.url ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {editable && (
                  <button
                    type="button"
                    className="action-btn danger"
                    title="Remove media"
                    onClick={() => removeItem(item.url)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {previewIndex !== null && (
        <MediaPreviewLightbox
          items={media}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

import { Check, Copy, Film, ImageIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ProductMedia } from "../../atoms/store";
import { uploader } from "../../atoms/uploadAtom";
import { FormFileInput } from "../form";
import { MediaPlaceholder } from "../ui/MediaPlaceholder";
import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";
import { TableView } from "../ui/TableView/TableView";
import "./ProductMediaTable.css";

interface ProductMediaTableProps {
  media: ProductMedia[];
  onChange?: (media: ProductMedia[]) => void;
  editable?: boolean;
}

interface UploadMediaResponse {
  url?: string;
  URL?: string;
  filename?: string;
  mime_type?: string;
  type?: string;
  size?: number;
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

const mediaFromUploadResponse = (res: UploadMediaResponse, file: File): ProductMedia => {
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleFiles = async (files: File[]) => {
    if (!files.length || !onChange) return;

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
          <FormFileInput
            label="Add product media"
            accept="image/*,video/*"
            multiple
            mediaType="any"
            onFilesChange={files => void handleFiles(files)}
            onSelectUpload={upload =>
              onChange?.([
                ...media,
                {
                  url: upload.url,
                  filename: upload.filename,
                  mime_type: upload.mime_type,
                  type: upload.mime_type?.startsWith("video/") ? "video" : "image",
                  size: upload.size,
                  created_at: upload.created_at,
                },
              ])
            }
          />
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
                <MediaPlaceholder
                  alt={item.filename}
                  className="product-media-table__thumb"
                  controls={false}
                  fit="cover"
                  href={item.url}
                  layout="thumbnail"
                  mediaType={isVideo(item) ? "video" : "image"}
                  muted
                  preserveFrame
                  showCaption={false}
                  size={{ height: 32, width: 32 }}
                />
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
              <div
                className="table-view__row-actions"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
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

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";
import "../store/Store.css";

export interface PreviewMediaItem {
  url: string;
  filename: string;
  mime_type?: string;
  type?: string;
}

interface MediaPreviewLightboxProps {
  items: PreviewMediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const isVideo = (item: PreviewMediaItem) =>
  item.mime_type?.startsWith("video/") || item.type === "video";

export function MediaPreviewLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: MediaPreviewLightboxProps) {
  if (!items[index] || typeof document === "undefined") return null;

  const item = items[index];
  const canCycle = items.length > 1;
  const previous = () => onIndexChange((index - 1 + items.length) % items.length);
  const next = () => onIndexChange((index + 1) % items.length);

  return createPortal(
    <div className="up-upload-lightbox media-preview-lightbox" onClick={onClose}>
      <div className="up-upload-lightbox-content" onClick={e => e.stopPropagation()}>
        <div className="media-preview-frame">
          {isVideo(item) ? (
            <video src={item.url} controls autoPlay className="media-preview-object" />
          ) : (
            <img src={item.url} alt={item.filename} className="media-preview-object" />
          )}
          {canCycle && (
            <>
              <button
                type="button"
                className="action-btn btn-ghost media-preview-cycle media-preview-cycle--prev"
                onClick={previous}
                title="Previous"
                aria-label="Previous media"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="action-btn btn-ghost media-preview-cycle media-preview-cycle--next"
                onClick={next}
                title="Next"
                aria-label="Next media"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
        <div className="up-upload-lightbox-bar">
          <span className="up-upload-lightbox-name">{item.filename}</span>
          <div className="thread-actions">
            <button className="action-btn view-btn" title="Close" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

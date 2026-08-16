import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MediaPlaceholder } from "./MediaPlaceholder";
import "./MediaPreviewLightbox.css";

export interface PreviewMediaItem {
  url: string;
  filename: string;
  mime_type?: string;
  type?: string;
}

interface MediaPreviewLightboxProps {
  items: PreviewMediaItem[];
  index: number;
  onIndexChange?: (index: number) => void;
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
  const item = items[index];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hasItem = Boolean(item);

  useEffect(() => {
    if (!hasItem || typeof document === "undefined") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeButtonRef.current?.focus();

    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      previousFocus?.focus();
    };
  }, [hasItem]);

  if (!item || typeof document === "undefined") return null;

  const canCycle = items.length > 1 && Boolean(onIndexChange);
  const previous = () => onIndexChange?.((index - 1 + items.length) % items.length);
  const next = () => onIndexChange?.((index + 1) % items.length);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="up-upload-lightbox media-preview-lightbox"
      onClick={onClose}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (event.key === "ArrowLeft" && canCycle) {
          event.preventDefault();
          previous();
        } else if (event.key === "ArrowRight" && canCycle) {
          event.preventDefault();
          next();
        }
      }}
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="up-upload-lightbox-content" onClick={e => e.stopPropagation()}>
        <div className="media-preview-frame">
          <MediaPlaceholder
            alt={item.filename}
            autoPlay={isVideo(item)}
            className="media-preview-object"
            controls
            fit="contain"
            href={item.url}
            layout="fill"
            mediaType={isVideo(item) ? "video" : "image"}
            playsInline
            preserveFrame
            showCaption={false}
            size={{ height: "100%", width: "100%" }}
          />
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
            <span className="up-upload-lightbox-count">
              {index + 1}/{items.length}
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              className="action-btn view-btn"
              title="Close"
              aria-label="Close media preview"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
}

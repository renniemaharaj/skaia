import { createPortal } from "react-dom";

interface ImageLightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, onClose }: ImageLightboxProps) {
  if (!imageUrl || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <button
      type="button"
      className="up-upload-lightbox"
      aria-label="Close image preview"
      onClick={onClose}
      onKeyDown={event => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <span className="up-upload-lightbox-content">
        <img src={imageUrl} alt="Preview" />
      </span>
    </button>,
    document.body
  );
}

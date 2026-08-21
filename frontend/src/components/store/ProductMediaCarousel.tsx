import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProductMedia } from "../../atoms/store";
import { MediaPlaceholder } from "../ui/MediaPlaceholder";
import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";
import "./ProductMediaCarousel.css";

interface ProductMediaCarouselProps {
  media: ProductMedia[];
  alt: string;
  className?: string;
  autoAdvance?: boolean;
}

export function ProductMediaCarousel({
  media,
  alt,
  className = "",
  autoAdvance = true,
}: ProductMediaCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const mediaKey = useMemo(() => media.map(item => item.url).join("\n"), [media]);
  const canCycle = media.length > 1;
  const safeIndex = media.length > 0 ? Math.min(Math.max(activeIndex, 0), media.length - 1) : 0;
  const activeMedia = media[safeIndex];
  const activeMediaIsVideo =
    activeMedia?.mime_type?.startsWith("video/") || activeMedia?.type === "video";

  useEffect(() => {
    setActiveIndex(0);
    setPreviewIndex(null);
    setHasInteracted(false);
  }, [mediaKey]);

  useEffect(() => {
    if (!autoAdvance || hasInteracted || !canCycle) return;
    const interval = window.setInterval(() => {
      setActiveIndex(index => (index + 1) % media.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [autoAdvance, canCycle, hasInteracted, media.length]);

  const move = (offset: number) => {
    setHasInteracted(true);
    setActiveIndex(index => (index + offset + media.length) % media.length);
  };

  return (
    <>
      <div
        className={`product-media-carousel${!activeMedia ? " fallback" : ""}${className ? ` ${className}` : ""}`}
      >
        {activeMedia ? (
          <button
            type="button"
            className="product-media-carousel__preview"
            onClick={() => {
              setHasInteracted(true);
              setPreviewIndex(safeIndex);
            }}
            aria-label={`Preview ${activeMedia.filename || alt}`}
          >
            <MediaPlaceholder
              alt={activeMedia.filename || alt}
              controls={false}
              fit="cover"
              href={activeMedia.url}
              layout="fill"
              mediaType={activeMediaIsVideo ? "video" : "image"}
              muted
              playsInline
              previewable={false}
              preserveFrame
              showCaption={false}
              size={{ height: "100%", width: "100%" }}
            />
          </button>
        ) : (
          <Package aria-hidden="true" size={48} />
        )}
        {canCycle && (
          <>
            <button
              type="button"
              className="action-btn btn-ghost product-media-carousel__cycle product-media-carousel__cycle--previous"
              onClick={() => move(-1)}
              title="Previous media"
              aria-label="Previous media"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="action-btn btn-ghost product-media-carousel__cycle product-media-carousel__cycle--next"
              onClick={() => move(1)}
              title="Next media"
              aria-label="Next media"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
        {activeMedia && (
          <div className="up-upload-lightbox-bar product-media-carousel__bar">
            <span className="up-upload-lightbox-name">{activeMedia.filename}</span>
            <span className="up-upload-lightbox-count">
              {safeIndex + 1}/{media.length}
            </span>
          </div>
        )}
      </div>
      {previewIndex !== null && media.length > 0 && (
        <MediaPreviewLightbox
          items={media}
          index={Math.min(previewIndex, media.length - 1)}
          onIndexChange={index => {
            setPreviewIndex(index);
            setActiveIndex(index);
          }}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
}

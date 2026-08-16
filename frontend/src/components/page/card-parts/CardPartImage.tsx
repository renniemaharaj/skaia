import { MediaPlaceholder } from "../../ui/MediaPlaceholder";
import type { ZoneAlign, ZoneSize } from "../types";
import "./card-parts.css";

interface CardPartImageProps {
  src?: string;
  alt?: string;
  align?: ZoneAlign;
  size?: ZoneSize;
  position?: "top" | "bottom" | "background";
  fixedHeight?: number;
}

const SIZE_HEIGHT: Record<ZoneSize, string> = {
  sm: "120px",
  md: "180px",
  lg: "240px",
};

export const CardPartImage = ({
  src,
  alt = "",
  align = "center",
  size = "md",
  position = "top",
  fixedHeight,
}: CardPartImageProps) => {
  const height = fixedHeight ? `${fixedHeight}px` : SIZE_HEIGHT[size];

  return (
    <div
      className={`cdp-image cdp-image--${position}${src ? "" : " cdp-image--empty"}`}
      style={{ minHeight: height, height: fixedHeight ? height : undefined }}
    >
      <MediaPlaceholder
        alt={alt}
        fit="cover"
        href={src}
        layout={position === "background" ? "background" : "fill"}
        mediaClassName="cdp-image__img"
        mediaStyle={{ objectPosition: align }}
        mediaType="image"
        preserveFrame
        showCaption={false}
        size={{ height: "100%", width: "100%" }}
      />
    </div>
  );
};

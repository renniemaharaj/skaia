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

  if (!src) {
    return (
      <div
        className={`cdp-image cdp-image--${position} cdp-image--empty`}
        style={{ minHeight: height, height: fixedHeight ? height : undefined }}
      />
    );
  }

  return (
    <div
      className={`cdp-image cdp-image--${position}`}
      style={{ minHeight: height, height: fixedHeight ? height : undefined }}
    >
      <img
        src={src}
        alt={alt}
        className="cdp-image__img"
        style={{ objectPosition: align }}
      />
    </div>
  );
};

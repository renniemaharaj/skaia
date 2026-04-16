import type { ZoneAlign, ZoneSize } from "../types";
import "./card-parts.css";

interface CardPartImageProps {
  src?: string;
  alt?: string;
  align?: ZoneAlign;
  size?: ZoneSize;
  position?: "top" | "bottom" | "background";
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
}: CardPartImageProps) => {
  if (!src) {
    return (
      <div
        className={`cdp-image cdp-image--${position} cdp-image--empty`}
        style={{ minHeight: SIZE_HEIGHT[size] }}
      />
    );
  }

  return (
    <div
      className={`cdp-image cdp-image--${position}`}
      style={{ minHeight: SIZE_HEIGHT[size] }}
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

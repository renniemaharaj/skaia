import type { ZoneAlign, ZoneSize } from "../types";
import "./card-parts.css";

interface CardPartHeadingProps {
  text?: string;
  align?: ZoneAlign;
  size?: ZoneSize;
}

const SIZE_CLASS: Record<ZoneSize, string> = {
  sm: "cdp-heading--sm",
  md: "cdp-heading--md",
  lg: "cdp-heading--lg",
};

export const CardPartHeading = ({
  text,
  align = "left",
  size = "md",
}: CardPartHeadingProps) => {
  if (!text) return null;

  return (
    <h3
      className={`cdp-heading ${SIZE_CLASS[size]}`}
      style={{ textAlign: align }}
    >
      {text}
    </h3>
  );
};

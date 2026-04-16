import type { ZoneAlign, ZoneSize } from "../types";
import "./card-parts.css";

interface CardPartSubheadingProps {
  text?: string;
  align?: ZoneAlign;
  size?: ZoneSize;
}

const SIZE_CLASS: Record<ZoneSize, string> = {
  sm: "cdp-subheading--sm",
  md: "cdp-subheading--md",
  lg: "cdp-subheading--lg",
};

export const CardPartSubheading = ({
  text,
  align = "left",
  size = "sm",
}: CardPartSubheadingProps) => {
  if (!text) return null;

  return (
    <p
      className={`cdp-subheading ${SIZE_CLASS[size]}`}
      style={{ textAlign: align }}
    >
      {text}
    </p>
  );
};

import type { ZoneAlign, ZoneSize } from "../types";
import "./card-parts.css";

interface CardPartIconProps {
  icon?: string;
  align?: ZoneAlign;
  size?: ZoneSize;
}

const SIZE_PX: Record<ZoneSize, number> = {
  sm: 24,
  md: 32,
  lg: 48,
};

export const CardPartIcon = ({
  icon,
  align = "left",
  size = "md",
}: CardPartIconProps) => {
  if (!icon) return null;

  const px = SIZE_PX[size];

  return (
    <div className="cdp-icon" style={{ textAlign: align }}>
      <span
        className="cdp-icon__glyph"
        style={{ width: px, height: px, fontSize: px * 0.6 }}
      >
        {icon}
      </span>
    </div>
  );
};

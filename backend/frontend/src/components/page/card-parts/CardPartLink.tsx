import type { ZoneAlign, ZoneSize } from "../types";
import "./card-parts.css";

interface CardPartLinkProps {
  url?: string;
  align?: ZoneAlign;
  size?: ZoneSize;
}

export const CardPartLink = ({
  url,
  align = "left",
  size = "sm",
}: CardPartLinkProps) => {
  if (!url) return null;

  return (
    <div className={`cdp-link cdp-link--${size}`} style={{ textAlign: align }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="cdp-link__anchor"
      >
        {url}
      </a>
    </div>
  );
};

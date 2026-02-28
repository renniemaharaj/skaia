import React from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import "./IDLink.css";

interface IDLinkProps {
  id: string;
  type: "user" | "thread";
  displayName?: string;
  username?: string;
  title?: string;
  className?: string;
  showCopy?: boolean;
}

/**
 * Unified component for referencing users and threads
 * Shows truncated ID with copy functionality and navigation
 */
const IDLink: React.FC<IDLinkProps> = ({
  id,
  type,
  displayName,
  username,
  title,
  className = "",
  showCopy = true,
}) => {
  const truncatedId = id.substring(0, 8).toUpperCase();
  const route = type === "user" ? `/users/${id}` : `/view-thread/${id}`;

  const displayText =
    type === "user"
      ? displayName || username || truncatedId
      : title || truncatedId;

  const hoverText = `View ${type === "user" ? "user profile" : "thread"}`;
  const fullId = `${type}:${id}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(fullId);
  };

  return (
    <div className={`id-link id-link--${type} ${className}`}>
      <Link to={route} className="id-link-text" title={hoverText}>
        {displayText}
      </Link>
      {showCopy && (
        <button
          className="id-link-copy"
          onClick={handleCopy}
          title={`Copy full ID: ${fullId}`}
          aria-label="Copy ID"
        >
          <Copy size={12} />
        </button>
      )}
    </div>
  );
};

export default IDLink;

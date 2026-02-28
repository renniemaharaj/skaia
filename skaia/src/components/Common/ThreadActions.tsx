import type { ReactNode } from "react";
import "./ThreadActions.css";

interface ThreadActionButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  title?: string;
  variant?: "view" | "edit" | "delete" | "submit" | "close" | "like";
  className?: string;
}

export const ThreadActionButton: React.FC<ThreadActionButtonProps> = ({
  icon,
  onClick,
  title,
  variant = "view",
  className = "",
}) => {
  return (
    <button
      className={`thread-action-btn ${variant}-btn ${className}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );
};

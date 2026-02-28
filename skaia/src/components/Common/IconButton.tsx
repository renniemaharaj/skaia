import type { ReactNode } from "react";
import "./IconButton.css";

interface IconButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  title?: string;
  variant?: "default" | "danger" | "primary";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  title,
  variant = "default",
  className = "",
  disabled = false,
  ariaLabel,
}) => {
  return (
    <button
      className={`icon-button ${variant} ${className}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon}
    </button>
  );
};

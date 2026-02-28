import type { ReactNode } from "react";
import "./FeatureCard.css";

interface FeatureCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  onClick,
  className = "",
  children,
}) => {
  const handleClick = onClick ? { onClick } : {};

  return (
    <div
      className={`feature-card ${className}`}
      role="article"
      {...handleClick}
    >
      {icon && <div className="feature-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
};

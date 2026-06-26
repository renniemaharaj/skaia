import type React from "react";
import "./RoleBadge.css";

interface RoleBadgeProps {
  role: string | { name: string; theme_color?: string; glow_color?: string };
  className?: string;
  style?: React.CSSProperties;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, className = "", style = {} }) => {
  // If we're given a string, we optionally look up the color from an atom if it's available,
  // but usually it's better to pass the color if we already have it.
  // Actually, let's just make it simpler:

  const roleName = typeof role === "string" ? role : role.name;
  const roleColor = typeof role === "string" ? undefined : role.theme_color || role.glow_color;

  const combinedStyle: React.CSSProperties = { ...style };
  if (roleColor) {
    combinedStyle.backgroundColor = roleColor;
    combinedStyle.color = "#fff";
    combinedStyle.border = "none";
  }

  return (
    <span className={`role-badge ${className}`} style={combinedStyle}>
      {roleName}
    </span>
  );
};

export default RoleBadge;

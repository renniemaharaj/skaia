import type { CSSProperties, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  style?: CSSProperties;
}

const glassCardStyle: CSSProperties = {
  padding: "1.5rem",
  background: "transparent",
  border: "1px solid var(--border-color)",
  borderRadius: "12px",
};

export const GlassCard = ({ children, style }: GlassCardProps) => (
  <div style={{ ...glassCardStyle, ...style }}>{children}</div>
);

import type { CSSProperties } from "react";
import { ContentFlatCard, type ContentFlatCardProps } from "./ContentFlatCard";

const standOutStyle: CSSProperties = {
  background: "color-mix(in srgb, var(--bg-secondary) 86%, transparent)",
  border: "1px solid color-mix(in srgb, var(--border-color) 82%, transparent)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 10px 32px color-mix(in srgb, var(--text-primary) 8%, transparent)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const groupStandOutStyle: CSSProperties = {
  background: "color-mix(in srgb, var(--bg-secondary) 70%, transparent)",
  border: "1px solid color-mix(in srgb, var(--border-color) 72%, transparent)",
  borderRadius: "var(--radius-md)",
  boxShadow: "none",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

interface ContentStandOutCardProps extends ContentFlatCardProps {
  emphasis?: "route" | "group";
}

/**
 * A single route-level focal surface. Keep usage minimal: normally no more than
 * one visible instance per route; supporting content should use ContentFlatCard.
 */
export const ContentStandOutCard = ({
  className,
  emphasis = "route",
  style,
  ...props
}: ContentStandOutCardProps) => (
  <ContentFlatCard
    {...props}
    className={`content-stand-out-card${className ? ` ${className}` : ""}`}
    style={{
      ...standOutStyle,
      ...(emphasis === "group" ? groupStandOutStyle : undefined),
      ...style,
    }}
  />
);

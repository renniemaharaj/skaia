import type { CSSProperties, HTMLAttributes } from "react";
import SpotlightCard from "../ui/SpotlightCard";

export interface ContentFlatCardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  spotlightColor?: string;
}

const contentFlatCardStyle: CSSProperties = {
  padding: "var(--content-flat-card-padding, var(--card-padding, 0.625rem))",
  background: "transparent",
  borderColor: "var(--content-flat-card-border-color, var(--card-border, transparent))",
  boxShadow: "none",
};

export const ContentFlatCard = ({
  children,
  className,
  spotlightColor = "rgba(255,255,255,0.15)",
  style,
  ...props
}: ContentFlatCardProps) => (
  <SpotlightCard
    className={`card--interactive content-flat-card${className ? ` ${className}` : ""}`}
    spotlightColor={spotlightColor}
    style={{ ...contentFlatCardStyle, ...style }}
    {...props}
  >
    {children}
  </SpotlightCard>
);

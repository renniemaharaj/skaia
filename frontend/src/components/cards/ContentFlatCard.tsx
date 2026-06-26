import type { CSSProperties, HTMLAttributes } from "react";
import SpotlightCard from "../ui/SpotlightCard";

export interface ContentFlatCardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  spotlightColor?: string;
  padding?: boolean;
}

const contentFlatCardPadding = "var(--content-flat-card-padding, var(--card-padding, 0.625rem))";

const contentFlatCardStyle: CSSProperties = {
  background: "transparent",
  borderColor: "var(--content-flat-card-border-color, var(--card-border, transparent))",
  boxShadow: "none",
};

export const ContentFlatCard = ({
  children,
  className,
  spotlightColor = "rgba(255,255,255,0.15)",
  padding = true,
  style,
  ...props
}: ContentFlatCardProps) => (
  <SpotlightCard
    className={`card--interactive content-flat-card${className ? ` ${className}` : ""}`}
    spotlightColor={spotlightColor}
    style={{
      padding: padding ? contentFlatCardPadding : undefined,
      ...contentFlatCardStyle,
      ...style,
    }}
    {...props}
  >
    {children}
  </SpotlightCard>
);

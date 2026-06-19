import type { CSSProperties, MouseEvent, ReactNode } from "react";
import SpotlightCard from "../ui/SpotlightCard";

export interface ContentFlatCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

const contentFlatCardStyle: CSSProperties = {
	padding: "var(--content-flat-card-padding, var(--card-padding, 0.625rem))",
  background: "transparent",
	borderColor:
		"var(--content-flat-card-border-color, var(--card-border, transparent))",
  boxShadow: "none",
};

export const ContentFlatCard = ({
  children,
  className,
  spotlightColor = "rgba(255,255,255,0.15)",
  style,
  onClick,
}: ContentFlatCardProps) => (
  <SpotlightCard
    className={`card--interactive content-flat-card${className ? ` ${className}` : ""}`}
    spotlightColor={spotlightColor}
    style={{ ...contentFlatCardStyle, ...style }}
    onClick={onClick}
  >
    {children}
  </SpotlightCard>
);

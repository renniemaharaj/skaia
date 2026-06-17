import type { CSSProperties, MouseEvent, ReactNode } from "react";
import SpotlightCard from "../ui/SpotlightCard";

interface ContentFlatCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

const contentFlatCardStyle: CSSProperties = {
  padding: 0,
  background: "transparent",
  borderColor: "transparent",
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

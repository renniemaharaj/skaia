import type { CSSProperties, ReactNode } from "react";
import { ContentFlatCard } from "./ContentFlatCard";

interface BaseCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface CardProps extends BaseCardProps {
  variant?: "primary" | "secondary";
  radius?: "project" | "flat";
  flat?: boolean;
}

const radiusStyle = (radius: CardProps["radius"]): CSSProperties => {
  if (radius === "flat") return { borderRadius: 0 };
  return {};
};

const variantClass = (variant: CardProps["variant"], flat?: boolean) => {
  const classes = ["card"];
  if (variant === "secondary") classes.push("card--section");
  if (flat) classes.push("card--flat-tile");
  return classes.join(" ");
};

export const Card = ({
  children,
  className,
  style,
  variant = "primary",
  flat = false,
  radius = "project",
}: CardProps) => (
  <ContentFlatCard
    className={`${variantClass(variant, flat)}${className ? ` ${className}` : ""}`}
    style={{ ...radiusStyle(radius), ...style }}
  >
    {children}
  </ContentFlatCard>
);

type VariantCardProps = CardProps;

export const PrimaryCard = (props: VariantCardProps) => <Card {...props} variant="primary" />;

export const SecondaryCard = (props: VariantCardProps) => <Card {...props} variant="secondary" />;

export const GlassCard = ({ children, className, style }: BaseCardProps) => (
  <ContentFlatCard className={className} style={style}>
    {children}
  </ContentFlatCard>
);

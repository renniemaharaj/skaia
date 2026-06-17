import type { CSSProperties, ReactNode } from "react";

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

const glassCardStyle: CSSProperties = {
  padding: "1.5rem",
  background: "transparent",
  border: "1px solid var(--border-color)",
  borderRadius: "12px",
};

const radiusStyle = (radius: CardProps["radius"]): CSSProperties => {
  if (radius === "flat") return { borderRadius: "8px" };
  return { borderRadius: "var(--card-radius)" };
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
  <div
    className={`${variantClass(variant, flat)}${className ? ` ${className}` : ""}`}
    style={{ ...radiusStyle(radius), ...style }}
  >
    {children}
  </div>
);

type VariantCardProps = CardProps;

export const PrimaryCard = (props: VariantCardProps) => (
  <Card {...props} variant="primary" />
);

export const SecondaryCard = (props: VariantCardProps) => (
  <Card {...props} variant="secondary" />
);

export const GlassCard = ({ children, className, style }: BaseCardProps) => (
  <div
    className={className}
    style={{ ...glassCardStyle, ...style }}
  >
    {children}
  </div>
);

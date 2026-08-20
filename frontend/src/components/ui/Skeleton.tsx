import type { CSSProperties, ReactNode } from "react";
import "./Skeleton.css";

export type SkeletonShape = "avatar" | "block" | "heading" | "media" | "pill" | "text";

interface SkeletonPrimitiveProps {
  shape?: SkeletonShape;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
}

export function SkeletonPrimitive({
  shape = "block",
  width,
  height,
  className = "",
}: SkeletonPrimitiveProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton skeleton-ui__primitive skeleton-ui__primitive--${shape} ${className}`.trim()}
      style={{ width, height }}
    />
  );
}

const DEFAULT_TEXT_WIDTHS = ["92%", "78%", "64%"] as const;

export function SkeletonText({
  lines = 3,
  widths = DEFAULT_TEXT_WIDTHS,
}: {
  lines?: number;
  widths?: readonly CSSProperties["width"][];
}) {
  return (
    <div className="skeleton-ui__text" aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <SkeletonPrimitive
          key={`line-${index + 1}`}
          shape="text"
          width={widths[index % widths.length]}
        />
      ))}
    </div>
  );
}

export type SkeletonContentVariant = "card" | "chart" | "content" | "form" | "media" | "table-row";

interface SkeletonContentProps {
  variant?: SkeletonContentVariant;
  label?: string;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
  announce?: boolean;
}

const TABLE_CELL_WIDTHS = ["72%", "58%", "64%", "48%"] as const;

function SkeletonComposition({ variant }: { variant: SkeletonContentVariant }) {
  switch (variant) {
    case "media":
      return <SkeletonPrimitive shape="media" />;
    case "chart":
      return (
        <>
          <SkeletonPrimitive shape="heading" width="38%" />
          <SkeletonPrimitive shape="block" height={180} />
        </>
      );
    case "form":
      return (
        <>
          <SkeletonPrimitive shape="heading" width="44%" />
          <SkeletonPrimitive shape="text" width="28%" />
          <SkeletonPrimitive shape="block" height={38} />
          <SkeletonPrimitive shape="text" width="34%" />
          <SkeletonPrimitive shape="block" height={38} />
        </>
      );
    case "table-row":
      return (
        <div className="skeleton-ui__table-row">
          {TABLE_CELL_WIDTHS.map((width, index) => (
            <SkeletonPrimitive key={`cell-${index + 1}`} shape="text" width={width} />
          ))}
        </div>
      );
    case "card":
      return (
        <>
          <SkeletonPrimitive shape="heading" width="58%" />
          <SkeletonText />
          <div className="skeleton-ui__card-footer">
            <SkeletonPrimitive shape="avatar" />
            <SkeletonPrimitive shape="text" width="32%" />
          </div>
        </>
      );
    default:
      return (
        <>
          <SkeletonPrimitive shape="heading" width="42%" />
          <SkeletonText />
        </>
      );
  }
}

/** Accessible owning region with decorative, content-shaped skeleton children. */
export function SkeletonContent({
  variant = "content",
  label = "Loading content",
  className = "",
  children,
  style,
  announce = true,
}: SkeletonContentProps) {
  return (
    <div
      className={`skeleton-ui skeleton-ui--${variant} ${className}`.trim()}
      role={announce ? "status" : undefined}
      aria-label={announce ? label : undefined}
      aria-busy="true"
      aria-live={announce ? "polite" : undefined}
      style={style}
    >
      {announce && <span className="skeleton-ui__announcement">{label}</span>}
      <div className="skeleton-ui__composition" aria-hidden="true">
        {children ?? <SkeletonComposition variant={variant} />}
      </div>
    </div>
  );
}

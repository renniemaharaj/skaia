import "./Tile.css";
import type * as React from "react";
import { forwardRef } from "react";

export type TileVariant = "interactive" | "static";

export interface TileProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant: interactive tiles respond to hover/click, static tiles do not. */
  variant?: TileVariant;
  /** Whether this tile is in a selected/active state. */
  selected?: boolean;
  /** Compact padding mode. */
  compact?: boolean;
  /** Render as a disabled, non-interactive tile. */
  disabled?: boolean;
}

/**
 * Generic Tile / Card primitive.
 *
 * A flexible container surface used for interactive selectable items
 * (e.g., component picker options, grid cards) and static display panels.
 * Maps to the card design-token system from index.css.
 */
const Tile = forwardRef<HTMLDivElement, TileProps>(
  (
    {
      variant = "static",
      selected = false,
      compact = false,
      disabled = false,
      className,
      children,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const classes = [
      "sk-tile",
      `sk-tile--${variant}`,
      selected && "sk-tile--selected",
      compact && "sk-tile--compact",
      disabled && "sk-tile--disabled",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        className={classes}
        role={variant === "interactive" ? "button" : undefined}
        tabIndex={variant === "interactive" && !disabled ? 0 : undefined}
        aria-selected={variant === "interactive" ? selected : undefined}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={
          variant === "interactive" && !disabled
            ? (e) => {
                if ((e.key === "Enter" || e.key === " ") && onClick) {
                  e.preventDefault();
                  onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
                }
              }
            : undefined
        }
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Tile.displayName = "Tile";
export default Tile;

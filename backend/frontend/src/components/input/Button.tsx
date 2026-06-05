import "./Button.css";
import type * as React from "react";
import { forwardRef } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning"
  | "outline";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. */
  variant?: ButtonVariant;
  /** Size preset. */
  size?: ButtonSize;
  /** Render as a full-width block button. */
  block?: boolean;
  /** Render with pill (fully rounded) borders. */
  pill?: boolean;
  /** Show a loading spinner and disable interaction. */
  loading?: boolean;
  /** Optional icon placed before the label. */
  iconLeft?: React.ReactNode;
  /** Optional icon placed after the label. */
  iconRight?: React.ReactNode;
}

/**
 * Generic Button primitive.
 *
 * Replaces raw `<button>` elements throughout the app with a typed,
 * consistently-styled component that maps to the existing `.btn` design-token
 * system defined in `index.css`.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      block = false,
      pill = false,
      loading = false,
      iconLeft,
      iconRight,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) => {
    const classes = [
      "sk-btn",
      `sk-btn--${variant}`,
      `sk-btn--${size}`,
      block && "sk-btn--block",
      pill && "sk-btn--pill",
      loading && "sk-btn--loading",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className="sk-btn__spinner" aria-hidden="true" />}
        {!loading && iconLeft && (
          <span className="sk-btn__icon">{iconLeft}</span>
        )}
        {children && <span className="sk-btn__label">{children}</span>}
        {!loading && iconRight && (
          <span className="sk-btn__icon">{iconRight}</span>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
export default Button;

import "./Checkbox.css";
import { Check } from "lucide-react";
import type * as React from "react";
import { forwardRef, useId } from "react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Label text displayed next to the checkbox. */
  label?: React.ReactNode;
  /** Size preset. */
  size?: "sm" | "md" | "lg";
  /** Description text below the label. */
  description?: string;
}

/**
 * Generic Checkbox primitive.
 *
 * Replaces raw `<input type="checkbox">` elements with a styled component
 * featuring a custom SVG checkmark (via lucide-react), unified border-radius,
 * and consistent label spacing.
 */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, size = "md", description, disabled, className, id, checked, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;

    const wrapperClasses = [
      "sk-checkbox",
      `sk-checkbox--${size}`,
      disabled && "sk-checkbox--disabled",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={wrapperClasses}>
        <div className="sk-checkbox__control">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            className="sk-checkbox__input"
            disabled={disabled}
            checked={checked}
            {...rest}
          />
          <div
            className={`sk-checkbox__box${checked ? " sk-checkbox__box--checked" : ""}`}
            aria-hidden="true"
          >
            <Check className="sk-checkbox__check" strokeWidth={3} />
          </div>
        </div>
        {(label || description) && (
          <div className="sk-checkbox__text">
            {label && (
              <label className="sk-checkbox__label" htmlFor={inputId}>
                {label}
              </label>
            )}
            {description && <p className="sk-checkbox__description">{description}</p>}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
export default Checkbox;

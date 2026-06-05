import "./Select.css";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { forwardRef } from "react";

export type SelectVariant = "standard" | "minimal";
export type SelectSize = "sm" | "md" | "lg";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Visual variant. */
  variant?: SelectVariant;
  /** Size preset. */
  size?: SelectSize;
  /** Options to render. Can also pass `<option>` children directly. */
  options?: SelectOption[];
  /** Label displayed above the select. */
  label?: string;
  /** Error message displayed below the select. */
  error?: string;
  /** Full-width mode. */
  block?: boolean;
}

/**
 * Generic Select primitive.
 *
 * Replaces raw `<select>` elements throughout the app with a typed,
 * consistently-styled component. Features a custom chevron arrow and
 * proper spacing that align with the design-token system.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      variant = "standard",
      size = "md",
      options,
      label,
      error,
      block = false,
      disabled,
      className,
      children,
      id,
      ...rest
    },
    ref,
  ) => {
    const wrapperClasses = [
      "sk-select",
      `sk-select--${variant}`,
      `sk-select--${size}`,
      block && "sk-select--block",
      error && "sk-select--error",
      disabled && "sk-select--disabled",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const selectId = id || (label ? `sk-select-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <div className={wrapperClasses}>
        {label && (
          <label className="sk-select__label" htmlFor={selectId}>
            {label}
          </label>
        )}
        <div className="sk-select__wrapper">
          <select
            ref={ref}
            id={selectId}
            className="sk-select__native"
            disabled={disabled}
            aria-invalid={!!error || undefined}
            {...rest}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="sk-select__arrow" size={16} aria-hidden="true" />
        </div>
        {error && <p className="sk-select__error">{error}</p>}
      </div>
    );
  },
);

Select.displayName = "Select";
export default Select;

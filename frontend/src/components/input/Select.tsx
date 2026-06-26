import "./Select.css";
import { ChevronDown } from "lucide-react";
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { GlassMenu, type GlassMenuOption } from "../ui/GlassMenu";

export type SelectVariant = "standard" | "minimal";
export type SelectSize = "sm" | "md" | "lg";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
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
      style,
      value,
      defaultValue,
      onChange,
      ...rest
    },
    ref
  ) => {
    const nativeSelectRef = useRef<HTMLSelectElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [menuPosition, setMenuPosition] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const [uncontrolledValue, setUncontrolledValue] = useState(() =>
      defaultValue !== undefined ? String(defaultValue) : ""
    );

    useImperativeHandle(ref, () => nativeSelectRef.current as HTMLSelectElement);

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

    const selectId =
      id || (label ? `sk-select-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
    const nativeSelectId = selectId ? `${selectId}-native` : undefined;
    const optionItems = useMemo<SelectOption[]>(() => {
      if (options) return options;

      const processChild = (child: React.ReactNode): SelectOption[] => {
        if (!React.isValidElement(child)) return [];
        if (child.type === "optgroup") {
          const props = (child as any).props;
          return React.Children.toArray(props.children).flatMap(processChild);
        }
        if (child.type === "option") {
          const props = (child as any).props;
          return [
            {
              value: String(props.value ?? ""),
              label:
                typeof props.children === "string"
                  ? props.children
                  : String(props.children ?? props.value ?? ""),
              disabled: props.disabled,
            },
          ];
        }
        return [];
      };
      return React.Children.toArray(children).flatMap(processChild);
    }, [children, options]);
    const fallbackValue =
      optionItems.find(opt => !opt.disabled)?.value ?? optionItems[0]?.value ?? "";
    const selectedValue =
      value !== undefined ? String(value) : String(uncontrolledValue || fallbackValue);
    const selectedOption = optionItems.find(opt => opt.value === selectedValue);
    const selectedLabel = selectedOption?.label || "Select";
    const menuOptions = useMemo<GlassMenuOption[]>(
      () =>
        optionItems.map(opt => ({
          key: opt.value,
          title: opt.label,
          disabled: opt.disabled,
          onClick: () => {
            if (opt.disabled) return;
            if (value === undefined) setUncontrolledValue(opt.value);
            const select = nativeSelectRef.current;
            if (select) {
              select.value = opt.value;
              onChange?.({
                target: select,
                currentTarget: select,
              } as React.ChangeEvent<HTMLSelectElement>);
            }
          },
        })),
      [onChange, optionItems, value]
    );

    const openMenu = () => {
      if (disabled) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 6,
      });
    };
    const ariaLabel = rest["aria-label"];

    return (
      <div className={wrapperClasses} style={style}>
        {label && (
          <label className="sk-select__label" htmlFor={selectId}>
            {label}
          </label>
        )}
        <div className="sk-select__wrapper">
          <select
            ref={nativeSelectRef}
            id={nativeSelectId}
            className="sk-select__native"
            disabled={disabled}
            aria-invalid={!!error || undefined}
            aria-hidden="true"
            tabIndex={-1}
            value={selectedValue}
            onChange={event => {
              if (value === undefined) setUncontrolledValue(event.target.value);
              onChange?.(event);
            }}
            {...rest}
          >
            {options
              ? options.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <button
            ref={triggerRef}
            id={selectId}
            type="button"
            className="sk-select__trigger"
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={!!menuPosition}
            aria-invalid={!!error || undefined}
            aria-labelledby={label ? selectId : undefined}
            aria-label={ariaLabel}
            onClick={openMenu}
            onKeyDown={event => {
              if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMenu();
              }
            }}
          >
            <span className="sk-select__value">{selectedLabel}</span>
            <ChevronDown className="sk-select__arrow" size={16} aria-hidden="true" />
          </button>
          {menuPosition && (
            <GlassMenu
              x={menuPosition.x}
              y={menuPosition.y}
              options={menuOptions}
              onClose={() => setMenuPosition(null)}
            />
          )}
        </div>
        {error && <p className="sk-select__error">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
export default Select;

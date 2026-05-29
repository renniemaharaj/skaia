import { Search } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef } from "react";
import "./SearchField.css";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  iconSize?: number;
  autoFocus?: boolean;
  "aria-label"?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  children?: React.ReactNode;
}

export default function SearchField({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  inputClassName = "",
  iconClassName = "",
  iconSize = 16,
  autoFocus = false,
  "aria-label": ariaLabel,
  onKeyDown,
  children,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const classes = ["search-field", className].filter(Boolean).join(" ");
  const inputClasses = ["search-field__input", inputClassName]
    .filter(Boolean)
    .join(" ");
  const iconClasses = ["search-field__icon", iconClassName]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={classes}>
      <Search size={iconSize} className={iconClasses} />
      <input
        ref={inputRef}
        className={inputClasses}
        type="search"
        placeholder={placeholder}
        value={value}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {children}
    </div>
  );
}

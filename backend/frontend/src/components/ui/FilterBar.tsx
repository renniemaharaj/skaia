import { FilterX } from "lucide-react";
import type { ReactNode } from "react";
import Button from "../input/Button";
import SearchField from "./SearchField";
import "./FilterBar.css";

interface FilterBarProps {
  children?: ReactNode;
  id?: string;
  className?: string;
  compact?: boolean;
  ariaLabel?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  resultCount?: ReactNode;
  hasActiveFilters?: boolean;
  onClear?: () => void;
}

export function FilterBar({
  children,
  id,
  className = "",
  compact = false,
  ariaLabel = "Filters",
  searchValue,
  searchPlaceholder = "Search...",
  onSearchChange,
  resultCount,
  hasActiveFilters = false,
  onClear,
}: FilterBarProps) {
  const classes = ["filter-bar", compact && "filter-bar--compact", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div id={id} className={classes} aria-label={ariaLabel}>
      {onSearchChange && searchValue !== undefined && (
        <SearchField
          className="filter-bar__search"
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      )}
      <div className="filter-bar__controls">{children}</div>
      {resultCount !== undefined && <span className="filter-bar__count">{resultCount}</span>}
      {onClear && (
        <Button
          size="sm"
          variant="ghost"
          className="filter-bar__clear"
          onClick={onClear}
          disabled={!hasActiveFilters}
          title="Clear filters"
          aria-label="Clear filters"
          iconLeft={<FilterX size={compact ? 13 : 15} />}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

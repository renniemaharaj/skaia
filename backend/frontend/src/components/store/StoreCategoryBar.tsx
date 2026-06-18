import {
  ChevronDown,
  ClipboardList,
  Columns2,
  FilterX,
  LayoutGrid,
  Plus,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { StoreCategory } from "../../atoms/store";
import Button from "../input/Button";
import Select from "../input/Select";
import SearchField from "../ui/SearchField";
import type { StoreFilterState, StoreViewMode } from "./Store";

interface StoreCategoryBarProps {
  categories: StoreCategory[];
  filters: StoreFilterState;
  resultCount: number;
  canCreateCategory: boolean;
  canCreateProduct: boolean;
  canDeleteCategory: boolean;
  isAuthenticated: boolean;
  viewMode: StoreViewMode;
  onChangeFilters: (filters: StoreFilterState) => void;
  onChangeViewMode: (viewMode: StoreViewMode) => void;
  onToggleCategory: (categoryId: string) => void;
  onClearFilters: () => void;
  onDeleteCategory: (categoryId: string) => void;
  onNavigate: (path: string) => void;
}

export function StoreCategoryBar({
  categories,
  filters,
  resultCount,
  canCreateCategory,
  canCreateProduct,
  canDeleteCategory,
  isAuthenticated,
  viewMode,
  onChangeFilters,
  onChangeViewMode,
  onToggleCategory,
  onClearFilters,
  onDeleteCategory,
  onNavigate,
}: StoreCategoryBarProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const hasActiveFilters =
    filters.search.trim() ||
    filters.categoryIds.length > 0 ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.minRating !== "0" ||
    filters.sort !== "newest";

  const updateFilter = <K extends keyof StoreFilterState>(key: K, value: StoreFilterState[K]) => {
    onChangeFilters({ ...filters, [key]: value });
  };

  useEffect(() => {
    if (hasActiveFilters) setFiltersExpanded(true);
  }, [hasActiveFilters]);

  return (
    <div className="categories-bar">
      <div className="store-filter-shell">
        <div className="category-list" aria-label="Store categories">
          <button
            type="button"
            className={`category-button ${
              filters.categoryIds.length === 0 ? "category-active" : ""
            }`}
            onClick={() => updateFilter("categoryIds", [])}
          >
            All
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="category-item">
              <button
                type="button"
                className={`category-button ${
                  filters.categoryIds.includes(cat.id) ? "category-active" : ""
                }`}
                onClick={() => onToggleCategory(cat.id)}
                aria-pressed={filters.categoryIds.includes(cat.id)}
              >
                {cat.name}
              </button>
              {canDeleteCategory && (
                <button
                  type="button"
                  className="btn-admin-icon btn-danger"
                  title="Delete category"
                  onClick={() => onDeleteCategory(cat.id)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          <span className="store-filter-count">{resultCount} shown</span>
          <div className="store-bar-actions">
            {canCreateCategory && (
              <Button
                size="sm"
                variant="action"
                onClick={() => onNavigate("/store/new-category")}
                title="New category"
                aria-label="New category"
                iconLeft={<Plus size={16} />}
              >
                <span className="store-action-label">New Category</span>
              </Button>
            )}
            {canCreateProduct && categories.length > 0 && (
              <Button
                size="sm"
                variant="action"
                onClick={() => onNavigate("/store/new-product")}
                title="New product"
                aria-label="New product"
                iconLeft={<Plus size={16} />}
              >
                <span className="store-action-label">New Product</span>
              </Button>
            )}
            {isAuthenticated && (
              <>
                <Button
                  size="sm"
                  variant="action"
                  className="store-wallet-button"
                  onClick={() => onNavigate(`/wallet/${crypto.randomUUID()}`)}
                  title="My Wallet"
                  aria-label="My Wallet"
                  iconLeft={<Wallet size={16} />}
                >
                  <span className="store-action-label">Wallet</span>
                </Button>
                <Button
                  size="sm"
                  variant="action"
                  className="store-orders-button"
                  onClick={() => onNavigate("/store/orders")}
                  title="My Orders"
                  aria-label="My Orders"
                  iconLeft={<ClipboardList size={16} />}
                >
                  <span className="store-action-label">My Orders</span>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="store-filter-mobile-row">
          <Button
            size="sm"
            variant="action"
            className="store-filter-toggle"
            onClick={() => setFiltersExpanded(expanded => !expanded)}
            aria-expanded={filtersExpanded}
            aria-controls="store-filter-panel"
            iconLeft={<SlidersHorizontal size={15} />}
            iconRight={
              <ChevronDown
                size={15}
                className={
                  filtersExpanded ? "store-filter-toggle-icon expanded" : "store-filter-toggle-icon"
                }
              />
            }
          >
            Filters
          </Button>
          <span className="store-filter-mobile-count">{resultCount} shown</span>
        </div>

        <div
          id="store-filter-panel"
          className={`store-filter-panel ${filtersExpanded ? "expanded" : ""}`}
          aria-label="Store filters"
        >
          <SearchField
            className="store-filter-search"
            value={filters.search}
            onChange={value => updateFilter("search", value)}
            placeholder="Search products"
          />

          <Select
            size="sm"
            className="store-filter-select"
            aria-label="Sort products"
            value={filters.sort}
            onChange={event => updateFilter("sort", event.target.value as StoreFilterState["sort"])}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "rating-desc", label: "Top rated" },
              { value: "price-asc", label: "Price low" },
              { value: "price-desc", label: "Price high" },
            ]}
          />

          <Select
            size="sm"
            className="store-filter-select"
            aria-label="Minimum rating"
            value={filters.minRating}
            onChange={event => updateFilter("minRating", event.target.value)}
            options={[
              { value: "0", label: "Any rating" },
              { value: "5", label: "5 stars" },
              { value: "4", label: "4+ stars" },
              { value: "3", label: "3+ stars" },
              { value: "2", label: "2+ stars" },
              { value: "1", label: "1+ stars" },
            ]}
          />

          <div className="store-price-filter" aria-label="Price range">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="store-filter-input"
              value={filters.minPrice}
              onChange={event => updateFilter("minPrice", event.target.value)}
              placeholder="Min"
              aria-label="Minimum price"
            />
            <span className="store-price-separator">to</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="store-filter-input"
              value={filters.maxPrice}
              onChange={event => updateFilter("maxPrice", event.target.value)}
              placeholder="Max"
              aria-label="Maximum price"
            />
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="store-clear-filters"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            title="Clear filters"
            aria-label="Clear filters"
            iconLeft={<FilterX size={15} />}
          >
            Clear
          </Button>

          <div className="store-view-switch" aria-label="Product card view">
            <button
              type="button"
              className={`store-view-button ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => onChangeViewMode("grid")}
              title="Compact grid"
              aria-label="Compact grid"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={`store-view-button ${viewMode === "wide" ? "active" : ""}`}
              onClick={() => onChangeViewMode("wide")}
              title="Wide two-column cards"
              aria-label="Wide two-column cards"
              aria-pressed={viewMode === "wide"}
            >
              <Columns2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

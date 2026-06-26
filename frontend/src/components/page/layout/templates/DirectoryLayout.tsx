import { LayoutGrid, List } from "lucide-react";
import type { ReactNode } from "react";
import { FilterBar } from "../../../ui/FilterBar";
import { type TableColumn, TableView } from "../../../ui/TableView/TableView";
import "./DirectoryLayout.css";

export type ViewMode = "grid" | "list";

export interface DirectoryLayoutProps<T> {
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;

  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;

  metrics?: ReactNode[];

  items: T[];

  // Grid mode props
  renderGridCard: (item: T, index: number) => ReactNode;
  prependGridCard?: ReactNode;

  // List mode props
  tableColumns?: TableColumn<T>[];
  tableRowKey?: (item: T, index: number) => string | number;
  tableEmptyState?: ReactNode;
  renderRowWrapper?: (
    item: T,
    index: number,
    rowProps: { className: string; style: React.CSSProperties },
    cells: ReactNode[]
  ) => ReactNode;

  // Prefer tableColumns for list mode. These remain for bespoke feeds only.
  renderListRow?: (item: T, index: number) => ReactNode;
  listHeader?: ReactNode;

  customListContent?: ReactNode;
  customGridContent?: ReactNode;

  // View mode
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;

  emptyState?: ReactNode;
  className?: string;
}

export function DirectoryLayout<T>({
  title,
  subtitle,
  headerActions,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  metrics,
  items,
  renderGridCard,
  prependGridCard,
  tableColumns,
  tableRowKey,
  tableEmptyState,
  renderRowWrapper,
  renderListRow,
  listHeader,
  customListContent,
  customGridContent,
  viewMode = "grid",
  onViewModeChange,
  emptyState,
  className = "",
}: DirectoryLayoutProps<T>) {
  const hasListRenderer = !!tableColumns || !!renderListRow || !!customListContent;
  const isList = viewMode === "list" && hasListRenderer;
  const canRenderGrid = !!renderGridCard || !!customGridContent;
  const contentMode = isList ? "list" : "grid";

  return (
    <div className={`directory-layout ${className}`} data-view={contentMode}>
      <div className="directory-layout__header">
        <div className="directory-layout__header-left">
          <h1 className="directory-layout__title">{title}</h1>
          {subtitle && <p className="directory-layout__subtitle">{subtitle}</p>}
        </div>
      </div>

      {(!!onSearchChange ||
        (metrics && metrics.length > 0) ||
        headerActions ||
        onViewModeChange) && (
        <div className="directory-layout__toolbar-container">
          <FilterBar
            compact
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            className="directory-layout__toolbar"
          >
            {metrics && metrics.length > 0 && (
              <div className="directory-layout__metrics">
                {metrics.map((metric, i) => (
                  <span key={i} className="directory-layout__metric">
                    {metric}
                  </span>
                ))}
              </div>
            )}
            {(headerActions || onViewModeChange) && (
              <div className="directory-layout__header-actions">
                {headerActions}
                {onViewModeChange && (
                  <div className="directory-layout__view-toggle">
                    <button
                      className={`directory-view-btn ${viewMode === "grid" ? "active" : ""}`}
                      onClick={() => onViewModeChange("grid")}
                      title="Grid view"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      className={`directory-view-btn ${viewMode === "list" ? "active" : ""}`}
                      onClick={() => onViewModeChange("list")}
                      title="List view"
                    >
                      <List size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </FilterBar>
        </div>
      )}

      {items?.length === 0 && !prependGridCard && emptyState ? (
        <div className="directory-layout__empty-container">{emptyState}</div>
      ) : isList ? (
        customListContent ? (
          <div className="directory-layout__list directory-layout__list--custom">
            {customListContent}
          </div>
        ) : (
          <div className="directory-layout__list">
            {tableColumns ? (
              <TableView
                data={items || []}
                columns={tableColumns}
                renderRowWrapper={renderRowWrapper}
                rowKey={tableRowKey ?? ((_item, i) => i)}
                emptyState={tableEmptyState}
              />
            ) : (
              <>
                {listHeader && <div className="directory-layout__list-header">{listHeader}</div>}
                {items?.map((item, index) => renderListRow?.(item, index))}
              </>
            )}
          </div>
        )
      ) : customGridContent ? (
        customGridContent
      ) : canRenderGrid ? (
        <div className="directory-layout__grid">
          {prependGridCard}
          {items?.map((item, index) => renderGridCard?.(item, index))}
        </div>
      ) : (
        <div className="directory-layout__empty-container">{emptyState ?? null}</div>
      )}
    </div>
  );
}

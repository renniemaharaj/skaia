import React, { type ReactNode, useEffect, useRef, useState } from "react";
import "./TableView.css";

export interface TableColumn<T> {
  id?: string;
  header: ReactNode;
  cell: (item: T, index: number) => ReactNode;
  width?: string;
  className?: string;
}

export interface TableViewProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  toolbar?: ReactNode;
  rowKey?: (item: T, index: number) => string | number;
  chrome?: "default" | "embedded";
  maxHeight?: number | string;
  renderRowWrapper?: (
    item: T,
    index: number,
    rowProps: { className: string; style: React.CSSProperties },
    cells: ReactNode[]
  ) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  /**
   * When true (default for tables with > AUTO_LAZY_THRESHOLD rows), rows that
   * are not yet visible in the viewport are replaced with a lightweight
   * skeleton placeholder — they render their real content only when the user
   * scrolls them into view.  Set to false to always render all rows eagerly.
   */
  lazyRows?: boolean;
}

/** Start lazily rendering when row count exceeds this threshold. */
const AUTO_LAZY_THRESHOLD = 25;

/** Approximate row height used for the skeleton placeholder (px). */
const PLACEHOLDER_ROW_HEIGHT = 45;

interface LazyRowProps<T> {
  item: T;
  index: number;
  gridTemplateColumns: string;
  columns: TableColumn<T>[];
  rowKey: string | number;
  renderRowWrapper?: TableViewProps<T>["renderRowWrapper"];
}

/**
 * A single table row that defers rendering until it enters the viewport.
 * While off-screen it renders a fixed-height skeleton div so the scroll
 * container keeps the correct total height.
 */
function LazyRow<T>({
  item,
  index,
  gridTemplateColumns,
  columns,
  rowKey,
  renderRowWrapper,
}: LazyRowProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect(); // render once, then stop observing
        }
      },
      // rootMargin pre-loads rows 200px before they scroll into view so
      // there's no perceptible flash of skeleton content during normal scrolling.
      { rootMargin: "200px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowProps = {
    className: "table-view__row",
    style: { gridTemplateColumns },
  };

  if (!visible) {
    return (
      <div
        ref={ref}
        className="table-view__row table-view__row--placeholder"
        style={{
          gridTemplateColumns,
          height: PLACEHOLDER_ROW_HEIGHT,
          minHeight: PLACEHOLDER_ROW_HEIGHT,
        }}
      >
        {columns.map(col => (
          <div
            key={col.id ?? `${String(col.header)}-ph`}
            className={`table-view__cell ${col.className || ""}`}
          >
            <div className="skeleton" style={{ width: "60%", height: 10, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  const cells = columns.map(col => (
    <div
      key={col.id ?? `${String(col.header)}-${col.width ?? "auto"}`}
      className={`table-view__cell ${col.className || ""}`}
    >
      {col.cell(item, index)}
    </div>
  ));

  if (renderRowWrapper) {
    return <>{renderRowWrapper(item, index, rowProps, cells)}</>;
  }

  return (
    <div key={rowKey} {...rowProps}>
      {cells}
    </div>
  );
}

export function TableView<T>({
  data,
  columns,
  toolbar,
  rowKey,
  chrome = "default",
  maxHeight,
  renderRowWrapper,
  emptyState,
  className = "",
  lazyRows,
}: TableViewProps<T>) {
  // Determine whether to use lazy row rendering.
  const useLazyRows = lazyRows ?? data.length > AUTO_LAZY_THRESHOLD;

  if (data.length === 0 && emptyState && !toolbar) {
    return <>{emptyState}</>;
  }

  const gridTemplateColumns = columns.map(col => col.width || "1fr").join(" ");

  const tableStyle =
    maxHeight === undefined
      ? undefined
      : {
          maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
        };
  const tableClassName = [
    "table-view",
    chrome === "embedded" ? "table-view--embedded" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={tableClassName} style={tableStyle}>
      {toolbar && <div className="table-view__toolbar">{toolbar}</div>}
      <div className="table-view__header" style={{ gridTemplateColumns }}>
        {columns.map(col => (
          <div
            key={col.id ?? `${String(col.header)}-${col.width ?? "auto"}`}
            className={`table-view__col-header ${col.className || ""}`}
          >
            {col.header}
          </div>
        ))}
      </div>
      <div className="table-view__body">
        {data.length === 0 && emptyState ? (
          <div className="table-view__empty">{emptyState}</div>
        ) : useLazyRows ? (
          data.map((item, i) => {
            const key = rowKey ? rowKey(item, i) : i;
            return (
              <React.Fragment key={key}>
                <LazyRow
                  item={item}
                  index={i}
                  gridTemplateColumns={gridTemplateColumns}
                  columns={columns}
                  rowKey={key}
                  renderRowWrapper={renderRowWrapper}
                />
              </React.Fragment>
            );
          })
        ) : (
          data.map((item, i) => {
            const key = rowKey ? rowKey(item, i) : i;
            const rowProps = {
              className: "table-view__row",
              style: { gridTemplateColumns },
            };

            const cells = columns.map(col => (
              <div
                key={col.id ?? `${String(col.header)}-${col.width ?? "auto"}`}
                className={`table-view__cell ${col.className || ""}`}
              >
                {col.cell(item, i)}
              </div>
            ));

            if (renderRowWrapper) {
              return (
                <React.Fragment key={key}>
                  {renderRowWrapper(item, i, rowProps, cells)}
                </React.Fragment>
              );
            }

            return (
              <div key={key} {...rowProps}>
                {cells}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

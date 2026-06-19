import React, { type ReactNode } from "react";
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
}: TableViewProps<T>) {
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

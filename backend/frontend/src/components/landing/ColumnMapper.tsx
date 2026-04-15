/**
 * ColumnMapper — drag-and-drop / select UI for mapping datasource columns
 * to LandingItem fields.
 *
 * Available columns (from evaluated rows) are shown as chips.
 * Target slots represent each LandingItem field (heading, subheading, etc.).
 * Users drag a chip onto a slot, or use the select dropdown.
 */
import { useCallback, useState } from "react";
import { X, GripHorizontal } from "lucide-react";
import type { ColumnMap, MappableField } from "./types";
import { MAPPABLE_FIELDS, MAPPABLE_FIELD_LABELS } from "./types";
import "./ColumnMapper.css";

interface ColumnMapperProps {
  /** Available column names detected from the datasource rows. */
  availableColumns: string[];
  /** Current column map state. */
  columnMap: ColumnMap;
  /** Called when the user updates the mapping. */
  onChange: (map: ColumnMap) => void;
}

export const ColumnMapper = ({
  availableColumns,
  columnMap,
  onChange,
}: ColumnMapperProps) => {
  const [dragOverField, setDragOverField] = useState<MappableField | null>(
    null,
  );

  // Set of columns already mapped
  const mappedCols = new Set(Object.values(columnMap).filter(Boolean));

  const handleDragStart = useCallback((e: React.DragEvent, colName: string) => {
    e.dataTransfer.setData("text/plain", colName);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, field: MappableField) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOverField(field);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverField(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, field: MappableField) => {
      e.preventDefault();
      setDragOverField(null);
      const colName = e.dataTransfer.getData("text/plain");
      if (colName) {
        onChange({ ...columnMap, [field]: colName });
      }
    },
    [columnMap, onChange],
  );

  const handleSelect = useCallback(
    (field: MappableField, colName: string) => {
      if (colName === "") {
        const next = { ...columnMap };
        delete next[field];
        onChange(next);
      } else {
        onChange({ ...columnMap, [field]: colName });
      }
    },
    [columnMap, onChange],
  );

  const handleClear = useCallback(
    (field: MappableField) => {
      const next = { ...columnMap };
      delete next[field];
      onChange(next);
    },
    [columnMap, onChange],
  );

  return (
    <div className="column-mapper">
      <div className="column-mapper-header">
        <span className="column-mapper-title">Column Mapping</span>
        <span className="column-mapper-hint">
          Drag columns onto card fields, or use the dropdowns
        </span>
      </div>

      {/* Available columns */}
      <div className="column-mapper-sources">
        {availableColumns.map((col) => (
          <span
            key={col}
            className={`column-mapper-chip${mappedCols.has(col) ? " mapped" : ""}`}
            draggable
            onDragStart={(e) => handleDragStart(e, col)}
          >
            <GripHorizontal size={12} />
            {col}
          </span>
        ))}
        {availableColumns.length === 0 && (
          <span className="column-mapper-hint">
            Evaluate the datasource to see available columns
          </span>
        )}
      </div>

      <div className="column-mapper-divider" />

      {/* Target slots */}
      <div className="column-mapper-targets">
        {MAPPABLE_FIELDS.map((field) => {
          const mapped = columnMap[field];
          return (
            <div
              key={field}
              className={`column-mapper-slot${dragOverField === field ? " drag-over" : ""}${mapped ? " filled" : ""}`}
              onDragOver={(e) => handleDragOver(e, field)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, field)}
            >
              <span className="column-mapper-slot-label">
                {MAPPABLE_FIELD_LABELS[field]}
              </span>
              <span className="column-mapper-slot-value">
                <select
                  value={mapped ?? ""}
                  onChange={(e) => handleSelect(field, e.target.value)}
                >
                  <option value="">— none —</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </span>
              {mapped && (
                <button
                  type="button"
                  className="column-mapper-slot-clear"
                  onClick={() => handleClear(field)}
                  title="Clear mapping"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

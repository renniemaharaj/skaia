import { useCallback, useState } from "react";
import { X, GripHorizontal } from "lucide-react";
import Button from "../../components/input/Button";
import Select from "../../components/input/Select";
import type { ComponentDefinition, BindPoint } from "./types";
import "./ColumnMapper.css"; // Reuse the same styles

interface ComponentBindMapperProps {
  availableColumns: string[];
  component: ComponentDefinition;
  bindings: Record<string, string>;
  onChange: (bindings: Record<string, string>) => void;
}

export const ComponentBindMapper = ({
  availableColumns,
  component,
  bindings,
  onChange,
}: ComponentBindMapperProps) => {
  const [dragOverField, setDragOverField] = useState<string | null>(null);

  const mappedCols = new Set(Object.values(bindings).filter(Boolean));

  const handleDragStart = useCallback((e: React.DragEvent, colName: string) => {
    e.dataTransfer.setData("text/plain", colName);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, fieldKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverField(fieldKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverField(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, fieldKey: string) => {
      e.preventDefault();
      setDragOverField(null);
      const colName = e.dataTransfer.getData("text/plain");
      if (colName) {
        onChange({ ...bindings, [fieldKey]: colName });
      }
    },
    [bindings, onChange],
  );

  const handleSelect = useCallback(
    (fieldKey: string, colName: string) => {
      if (colName === "") {
        const next = { ...bindings };
        delete next[fieldKey];
        onChange(next);
      } else {
        onChange({ ...bindings, [fieldKey]: colName });
      }
    },
    [bindings, onChange],
  );

  const handleClear = useCallback(
    (fieldKey: string) => {
      const next = { ...bindings };
      delete next[fieldKey];
      onChange(next);
    },
    [bindings, onChange],
  );

  return (
    <div className="column-mapper column-mapper--component-bind">
      <div className="column-mapper-header">
        <span className="column-mapper-title">
          Bind Data to {component.label}
        </span>
        <span className="column-mapper-hint">
          Drag columns onto component fields, or use the dropdowns
        </span>
      </div>

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

      <div className="column-mapper-targets">
        {component.bind_points.map((bp: BindPoint) => {
          const mapped = bindings[bp.key];
          return (
            <div
              key={bp.key}
              className={`column-mapper-slot${dragOverField === bp.key ? " drag-over" : ""}${mapped ? " filled" : ""}`}
              onDragOver={(e) => handleDragOver(e, bp.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, bp.key)}
            >
              <div className="column-mapper-slot-meta">
                <span className="column-mapper-slot-label">
                  {bp.label}{" "}
                  {bp.required && (
                    <span className="column-mapper-required">*</span>
                  )}
                </span>
                <span className="column-mapper-slot-kind">
                  {bp.kind}
                </span>
              </div>
              <span className="column-mapper-slot-value">
                <Select
                  value={mapped ?? ""}
                  onChange={(e) => handleSelect(bp.key, e.target.value)}
                  size="sm"
                  variant="minimal"
                  block
                >
                  <option value="">— none —</option>
                  {availableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </Select>
              </span>
              {mapped && (
                <Button
                  unstyled
                  type="button"
                  className="column-mapper-slot-clear"
                  onClick={() => handleClear(bp.key)}
                  title="Clear mapping"
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

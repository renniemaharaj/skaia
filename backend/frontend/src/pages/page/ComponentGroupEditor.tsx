/**
 * ComponentGroupEditor — manages a group of components rendered together per row.
 *
 * Users can add/remove components, select types, resize widths via controls and
 * mouse drag handles, and map columns to bind points for each component. The
 * group renders in a flex-wrap container where each component's width is a
 * percentage of the total.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type {
  ComponentDefinition,
  ComponentGroup,
  ComponentGroupItem,
} from "./types";
import { ComponentBindMapper } from "./ComponentBindMapper";
import { ComponentRenderer } from "./ComponentRenderer";
import { CardDesigner } from "./CardDesigner";
import { DEFAULT_CARD_TEMPLATE } from "./types";
import { DesignedCardWrapper } from "./blocks/DesignedCardWrapper";
import "./ComponentGroupEditor.css";

interface ComponentGroupEditorProps {
  group: ComponentGroup;
  components: ComponentDefinition[];
  availableColumns: string[];
  firstRow: Record<string, unknown> | null;
  onChange: (group: ComponentGroup) => void;
}

let nextId = 1;
function uid() {
  return `cg-${Date.now()}-${nextId++}`;
}

export function ComponentGroupEditor({
  group,
  components,
  availableColumns,
  firstRow,
  onChange,
}: ComponentGroupEditorProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"components" | "styles">(
    "components",
  );
  const [resizing, setResizing] = useState<{
    itemId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const sorted = useMemo(
    () => [...group.items].sort((a, b) => a.order - b.order),
    [group.items],
  );

  const update = useCallback(
    (items: ComponentGroupItem[]) => onChange({ ...group, items }),
    [group, onChange],
  );

  const addComponent = () => {
    const first = components[0];
    if (!first) return;
    const item: ComponentGroupItem = {
      id: uid(),
      component_type: first.type,
      bindings: {},
      width: Math.max(10, Math.floor(100 / (sorted.length + 1))),
      order: sorted.length,
    };
    update([...group.items, item]);
  };

  const removeComponent = (id: string) =>
    update(group.items.filter((i) => i.id !== id));

  const updateItem = (id: string, patch: Partial<ComponentGroupItem>) =>
    update(group.items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  /*  resize via mouse  */
  const startResize = (itemId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const item = group.items.find((i) => i.id === itemId);
    if (!item) return;
    setResizing({ itemId, startX: e.clientX, startWidth: item.width });

    const handleMove = (ev: MouseEvent) => {
      if (!previewRef.current) return;
      const containerW = previewRef.current.offsetWidth;
      const dx = ev.clientX - e.clientX;
      const pctDelta = (dx / containerW) * 100;
      const newW = Math.max(10, Math.min(100, item.width + pctDelta));
      updateItem(itemId, { width: Math.round(newW) });
    };
    const handleUp = () => {
      setResizing(null);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div className="cge">
      <div className="cge__tabs">
        <button
          className={`cge__tab ${activeTab === "components" ? "cge__tab--active" : ""}`}
          onClick={() => setActiveTab("components")}
        >
          Components
        </button>
        <button
          className={`cge__tab ${activeTab === "styles" ? "cge__tab--active" : ""}`}
          onClick={() => setActiveTab("styles")}
        >
          Styles
        </button>
      </div>

      {activeTab === "components" && (
        <>
          {/*  item list  */}
          <div className="cge__header">
            <span className="cge__title">Component Group</span>
            <button
              type="button"
              className="cge__add-btn"
              onClick={addComponent}
            >
              <Plus size={13} /> Add Component
            </button>
          </div>

          <div className="cge__items">
            {sorted.map((item) => {
              return (
                <div key={item.id} className="cge__item">
                  <GripVertical size={14} className="cge__item-grip" />
                  <select
                    className="cge__item-select"
                    value={item.component_type}
                    onChange={(e) =>
                      updateItem(item.id, {
                        component_type: e.target.value,
                        bindings: {},
                      })
                    }
                  >
                    {components.map((c) => (
                      <option key={c.type} value={c.type}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <label className="cge__item-width">
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={item.width}
                      onChange={(e) =>
                        updateItem(item.id, {
                          width: Math.max(
                            10,
                            Math.min(100, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                    <span>%</span>
                  </label>
                  <button
                    type="button"
                    className="cge__item-remove"
                    onClick={() => removeComponent(item.id)}
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          {/*  group settings  */}
          <div className="cge__settings">
            <label className="cge__setting">
              <span>Gap</span>
              <input
                type="number"
                min={0}
                max={48}
                value={group.gap}
                onChange={(e) =>
                  onChange({ ...group, gap: Number(e.target.value) })
                }
              />
              <span>px</span>
            </label>
            <label className="cge__setting">
              <span>Max Width</span>
              <input
                type="number"
                min={200}
                max={1600}
                step={50}
                value={group.max_width}
                onChange={(e) =>
                  onChange({ ...group, max_width: Number(e.target.value) })
                }
              />
              <span>px</span>
            </label>
          </div>

          {/*  per-component bind mappers  */}
          {sorted.map((item) => {
            const comp = components.find((c) => c.type === item.component_type);
            if (!comp) return null;
            return (
              <ComponentBindMapper
                key={item.id}
                availableColumns={availableColumns}
                component={comp}
                bindings={item.bindings}
                onChange={(b) => updateItem(item.id, { bindings: b })}
              />
            );
          })}
        </>
      )}

      {activeTab === "styles" && (
        <CardDesigner
          template={group.wrapper ?? DEFAULT_CARD_TEMPLATE}
          onChange={(template) => onChange({ ...group, wrapper: template })}
        />
      )}

      {/*  live preview  */}
      {firstRow && sorted.length > 0 && (
        <>
          <div className="cge__preview-label">Preview (first row)</div>
          <DesignedCardWrapper template={group.wrapper}>
            <div
              ref={previewRef}
              className="cge__preview"
              style={{
                maxWidth: group.max_width,
                gap: group.gap,
              }}
            >
              {sorted.map((item) => {
                const comp = components.find(
                  (c) => c.type === item.component_type,
                );
                if (!comp) return null;
                return (
                  <div
                    key={item.id}
                    className={`cge__preview-item${resizing?.itemId === item.id ? " cge__preview-item--resizing" : ""}`}
                    style={{ width: `${item.width}%` }}
                  >
                    <ComponentRenderer
                      component={comp}
                      bindings={item.bindings}
                      row={firstRow}
                    />
                    <div
                      className="cge__resize-handle"
                      onMouseDown={(e) => startResize(item.id, e)}
                      title="Drag to resize"
                    />
                  </div>
                );
              })}
            </div>
          </DesignedCardWrapper>
        </>
      )}
    </div>
  );
}

/** Renders a full group for one data row (used at display-time). */
export function ComponentGroupRenderer({
  group,
  row,
  components,
}: {
  group: ComponentGroup;
  row: Record<string, unknown>;
  components: ComponentDefinition[];
}) {
  const sorted = [...group.items].sort((a, b) => a.order - b.order);
  return (
    <DesignedCardWrapper template={group.wrapper}>
      <div
        className="cge__preview"
        style={{ maxWidth: group.max_width, gap: group.gap }}
      >
        {sorted.map((item) => {
          const comp = components.find((c) => c.type === item.component_type);
          if (!comp) return null;
          return (
            <div
              key={item.id}
              style={{ width: `${item.width}%` }}
              className="cge__preview-item"
            >
              <ComponentRenderer
                component={comp}
                bindings={item.bindings}
                row={row}
              />
            </div>
          );
        })}
      </div>
    </DesignedCardWrapper>
  );
}

import { ChevronDown, ChevronUp, Maximize2, Plus, Trash2 } from "lucide-react";
/**
 * ComponentGroupEditor - manages a group of components rendered together per row.
 *
 * Users can add/remove components, select types, resize widths via controls and
 * mouse drag handles, and map columns to bind points for each component. The
 * group renders in a flex-wrap container where each component's width is a
 * percentage of the total.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../ui/Button";
import Select from "../ui/Select";
import { CardDesigner } from "./CardDesigner";
import { ComponentBindMapper } from "./ComponentBindMapper";
import { ComponentRenderer } from "./ComponentRenderer";
import { DesignedCardWrapper } from "./blocks/DesignedCardWrapper";
import {
  moveComponentItem,
  normalizeComponentWidth,
  orderedComponentItems,
} from "./componentGroup";
import type { ComponentDefinition, ComponentGroup, ComponentGroupItem } from "./types";
import { COMPONENT_ICON_POSITIONS, DEFAULT_CARD_TEMPLATE } from "./types";
import "./ComponentGroupEditor.css";

interface ComponentGroupEditorProps {
  group: ComponentGroup;
  components: ComponentDefinition[];
  availableColumns: string[];
  firstRow: Record<string, unknown> | null;
  onChange: (group: ComponentGroup) => void;
  workspaceMode?: boolean;
  onWorkspaceModeChange?: (expanded: boolean) => void;
  showPreview?: boolean;
}

let nextId = 1;
function uid() {
  return `cg-${Date.now()}-${nextId++}`;
}

const ICON_POSITION_LABELS = {
  "top-left": "Icon: Top left",
  "top-right": "Icon: Top right",
  left: "Icon: Left of value",
  right: "Icon: Right of value",
} as const;

function WidthInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const normalized = normalizeComponentWidth(draft, value);
    setDraft(String(normalized));
    if (normalized !== value) onCommit(normalized);
  };

  return (
    <input
      type="number"
      min={10}
      max={100}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      aria-label="Component width percentage"
    />
  );
}

export function ComponentGroupEditor({
  group,
  components,
  availableColumns,
  firstRow,
  onChange,
  workspaceMode = false,
  onWorkspaceModeChange,
  showPreview = true,
}: ComponentGroupEditorProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"components" | "styles">("components");
  const [resizing, setResizing] = useState<{
    itemId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const sorted = useMemo(() => orderedComponentItems(group.items), [group.items]);

  const update = useCallback(
    (items: ComponentGroupItem[]) => onChange({ ...group, items }),
    [group, onChange]
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
    update([...sorted, item].map((entry, index) => ({ ...entry, order: index })));
  };

  const removeComponent = (id: string) =>
    update(sorted.filter(item => item.id !== id).map((item, index) => ({ ...item, order: index })));

  const moveComponent = (id: string, direction: "up" | "down") =>
    update(moveComponentItem(group.items, id, direction));

  const updateItem = (id: string, patch: Partial<ComponentGroupItem>) =>
    update(group.items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  /*  resize via mouse  */
  const startResize = (itemId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const item = group.items.find(i => i.id === itemId);
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
    <div className={`cge${workspaceMode ? " cge--workspace" : ""}`}>
      <div className="cge__tabs">
        <Button
          unstyled
          className={`cge__tab ${activeTab === "components" ? "cge__tab--active" : ""}`}
          onClick={() => setActiveTab("components")}
        >
          Components
        </Button>
        <Button
          unstyled
          className={`cge__tab ${activeTab === "styles" ? "cge__tab--active" : ""}`}
          onClick={() => setActiveTab("styles")}
        >
          Styles
        </Button>
        {onWorkspaceModeChange && (
          <Button
            unstyled
            type="button"
            className="cge__expand-btn"
            onClick={() => onWorkspaceModeChange(!workspaceMode)}
            title={workspaceMode ? "Return to code editor" : "Edit components in the left pane"}
            aria-label={workspaceMode ? "Return to code editor" : "Open component workspace"}
          >
            <Maximize2 size={15} />
            {workspaceMode ? "Code" : "Expand"}
          </Button>
        )}
      </div>

      {activeTab === "components" && (
        <>
          {/*  item list  */}
          <div className="cge__header">
            <span className="cge__title">Component Group</span>
            <Button unstyled type="button" className="cge__add-btn" onClick={addComponent}>
              <Plus size={13} /> Add Component
            </Button>
          </div>

          <div className="cge__items">
            {sorted.map((item, index) => {
              return (
                <div key={item.id} className="cge__item">
                  <span className="cge__item-move" aria-label="Component position controls">
                    <Button
                      unstyled
                      type="button"
                      onClick={() => moveComponent(item.id, "up")}
                      disabled={index === 0}
                      title="Move component up"
                      aria-label="Move component up"
                    >
                      <ChevronUp size={13} />
                    </Button>
                    <Button
                      unstyled
                      type="button"
                      onClick={() => moveComponent(item.id, "down")}
                      disabled={index === sorted.length - 1}
                      title="Move component down"
                      aria-label="Move component down"
                    >
                      <ChevronDown size={13} />
                    </Button>
                  </span>
                  <Select
                    className="cge__item-select"
                    value={item.component_type}
                    onChange={e =>
                      updateItem(item.id, {
                        component_type: e.target.value,
                        bindings: {},
                      })
                    }
                    size="sm"
                  >
                    {components.map(c => (
                      <option key={c.type} value={c.type}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                  {item.component_type === "compound.stat" && (
                    <Select
                      className="cge__icon-position"
                      value={item.icon_position ?? "top-left"}
                      onChange={event =>
                        updateItem(item.id, {
                          icon_position: event.target.value as ComponentGroupItem["icon_position"],
                        })
                      }
                      size="sm"
                      aria-label="Stat card icon position"
                    >
                      {COMPONENT_ICON_POSITIONS.map(position => (
                        <option key={position} value={position}>
                          {ICON_POSITION_LABELS[position]}
                        </option>
                      ))}
                    </Select>
                  )}
                  <label className="cge__item-width">
                    <WidthInput
                      value={item.width}
                      onCommit={width => updateItem(item.id, { width })}
                    />
                    <span>%</span>
                  </label>
                  <Button
                    unstyled
                    type="button"
                    className="cge__item-remove"
                    onClick={() => removeComponent(item.id)}
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </Button>
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
                onChange={e => onChange({ ...group, gap: Number(e.target.value) })}
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
                onChange={e => onChange({ ...group, max_width: Number(e.target.value) })}
              />
              <span>px</span>
            </label>
          </div>

          {/*  per-component bind mappers  */}
          {sorted.map(item => {
            const comp = components.find(c => c.type === item.component_type);
            if (!comp) return null;
            return (
              <ComponentBindMapper
                key={item.id}
                availableColumns={availableColumns}
                component={comp}
                bindings={item.bindings}
                onChange={b => updateItem(item.id, { bindings: b })}
              />
            );
          })}
        </>
      )}

      {activeTab === "styles" && (
        <CardDesigner
          template={group.wrapper ?? DEFAULT_CARD_TEMPLATE}
          onChange={template => onChange({ ...group, wrapper: template })}
        />
      )}

      {/*  live preview  */}
      {showPreview && firstRow && sorted.length > 0 && (
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
              {sorted.map(item => {
                const comp = components.find(c => c.type === item.component_type);
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
                      iconPosition={item.icon_position}
                    />
                    <div
                      className="cge__resize-handle"
                      onMouseDown={e => startResize(item.id, e)}
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
  const sorted = orderedComponentItems(group.items);
  return (
    <DesignedCardWrapper template={group.wrapper}>
      <div className="cge__preview" style={{ maxWidth: group.max_width, gap: group.gap }}>
        {sorted.map(item => {
          const comp = components.find(c => c.type === item.component_type);
          if (!comp) return null;
          return (
            <div key={item.id} style={{ width: `${item.width}%` }} className="cge__preview-item">
              <ComponentRenderer
                component={comp}
                bindings={item.bindings}
                row={row}
                iconPosition={item.icon_position}
              />
            </div>
          );
        })}
      </div>
    </DesignedCardWrapper>
  );
}

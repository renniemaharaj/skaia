/**
 * CardDesigner — visual card template builder.
 *
 * Lets the user configure card dimensions, toggle zones on/off,
 * reorder zones via drag-and-drop, and set alignment + size per zone.
 * Produces a CardTemplate stored in the section config JSON.
 */
import { lazy, Suspense, useCallback, useState } from "react";
import {
  GripVertical,
  Eye,
  EyeOff,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronUp,
  ChevronDown,
  Image,
  Type,
  FileText,
  Smile,
  ExternalLink,
} from "lucide-react";
import { BoxSpacingControls } from "./EditControls";
import type {
  CardTemplate,
  CardZone,
  CardWidth,
  ZoneAlign,
  ZoneSize,
  ImagePosition,
  MappableField,
  CardStyle,
  CardOverflow,
  CardContentAlign,
} from "./types";
import { DEFAULT_CARD_TEMPLATE, MAPPABLE_FIELD_LABELS } from "./types";
import "./CardDesigner.css";

interface CardDesignerProps {
  template: CardTemplate;
  onChange: (template: CardTemplate) => void;
  mode?: "card" | "table";
}

const CARD_WIDTH_OPTIONS: { value: CardWidth; label: string }[] = [
  { value: "narrow", label: "Narrow (3 col)" },
  { value: "regular", label: "Regular (4 col)" },
  { value: "wide", label: "Wide (6 col)" },
  { value: "halfway", label: "Half (8 col)" },
  { value: "full", label: "Full (12 col)" },
];

const ASPECT_RATIO_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1/1", label: "1:1 Square" },
  { value: "4/3", label: "4:3" },
  { value: "16/9", label: "16:9 Wide" },
  { value: "3/4", label: "3:4 Tall" },
];

const IMAGE_POSITION_OPTIONS: { value: ImagePosition; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "background", label: "Background" },
  { value: "none", label: "Hidden" },
];

const ZONE_SIZE_OPTIONS: { value: ZoneSize; label: string }[] = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];

const CARD_STYLE_OPTIONS: { value: CardStyle; label: string; hint: string }[] =
  [
    {
      value: "default",
      label: "Default",
      hint: "Standard card with border + shadow",
    },
    { value: "flat", label: "Flat", hint: "No shadow, subtle border" },
    {
      value: "elevated",
      label: "Elevated",
      hint: "Stronger shadow, no border",
    },
    {
      value: "outlined",
      label: "Outlined",
      hint: "Prominent border, no shadow",
    },
    { value: "glass", label: "Glass", hint: "Frosted glass / translucent" },
    { value: "filled", label: "Filled", hint: "Solid background, no border" },
    { value: "minimal", label: "Minimal", hint: "Borderless, no bg" },
  ];

const OVERFLOW_OPTIONS: { value: CardOverflow; label: string }[] = [
  { value: "hidden", label: "Hidden" },
  { value: "visible", label: "Visible" },
  { value: "auto", label: "Scroll" },
];

const CONTENT_ALIGN_OPTIONS: { value: CardContentAlign; label: string }[] = [
  { value: "start", label: "Top" },
  { value: "center", label: "Center" },
  { value: "end", label: "Bottom" },
  { value: "stretch", label: "Stretch" },
];

const MonacoEditor = lazy(() => import("../../components/monaco/Editor"));

const FIELD_ICONS: Record<MappableField, React.FC<{ size: number }>> = {
  image_url: Image,
  heading: Type,
  subheading: FileText,
  icon: Smile,
  link_url: ExternalLink,
};

export const CardDesigner = ({
  template,
  onChange,
  mode = "card",
}: CardDesignerProps) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const updateTemplate = useCallback(
    (updates: Partial<CardTemplate>) => {
      onChange({ ...template, ...updates });
    },
    [template, onChange],
  );

  const updateZone = useCallback(
    (index: number, updates: Partial<CardZone>) => {
      const zones = template.zones.map((z, i) =>
        i === index ? { ...z, ...updates } : z,
      );
      onChange({ ...template, zones });
    },
    [template, onChange],
  );

  const moveZone = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const zones = [...template.zones];
      const [moved] = zones.splice(from, 1);
      zones.splice(to, 0, moved);
      onChange({ ...template, zones });
    },
    [template, onChange],
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null) {
      moveZone(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const resetToDefault = () => {
    onChange({ ...DEFAULT_CARD_TEMPLATE });
  };

  // Filter zones: image_url is handled separately via imagePosition
  const bodyZoneIndices = template.zones
    .map((z, i) => ({ zone: z, originalIndex: i }))
    .filter((entry) => entry.zone.field !== "image_url");

  return (
    <div className="card-designer">
      <div className="card-designer__header">
        <span className="card-designer__title">Card Designer</span>
        <button
          type="button"
          className="card-designer__reset"
          onClick={resetToDefault}
        >
          Reset
        </button>
      </div>

      <div className="card-designer__body">
        <div className="card-designer__section">
          <button
            type="button"
            className={`card-designer__section-toggle${openSections.has("card-settings") ? " expanded" : ""}`}
            onClick={() => toggleSection("card-settings")}
          >
            <div>
              <span className="card-designer__group-heading">
                Card settings
              </span>
              <span className="card-designer__group-note">
                Size, behavior, and surface style
              </span>
            </div>
            <ChevronDown size={16} />
          </button>

          {openSections.has("card-settings") && (
            <div className="card-designer__section-body">
              <div className="cd-ctrl-row">
                <span className="cd-ctrl">
                  <label>Width</label>
                  <select
                    value={template.cardWidth}
                    onChange={(e) =>
                      updateTemplate({ cardWidth: e.target.value as CardWidth })
                    }
                  >
                    {CARD_WIDTH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="cd-ctrl">
                  <label>Ratio</label>
                  <select
                    value={template.aspectRatio ?? "auto"}
                    onChange={(e) =>
                      updateTemplate({
                        aspectRatio:
                          e.target.value === "auto"
                            ? undefined
                            : e.target.value,
                      })
                    }
                  >
                    {ASPECT_RATIO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="cd-ctrl">
                  <label>Overflow</label>
                  <select
                    value={template.overflow ?? "hidden"}
                    onChange={(e) =>
                      updateTemplate({
                        overflow: e.target.value as CardOverflow,
                      })
                    }
                  >
                    {OVERFLOW_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="cd-ctrl">
                  <label>Align</label>
                  <select
                    value={template.contentAlign ?? "start"}
                    onChange={(e) =>
                      updateTemplate({
                        contentAlign: e.target.value as CardContentAlign,
                      })
                    }
                  >
                    {CONTENT_ALIGN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              <div className="cd-ctrl-row">
                <span className="cd-ctrl">
                  <label>Min H</label>
                  <input
                    type="number"
                    min={0}
                    max={800}
                    step={20}
                    placeholder="—"
                    value={template.minHeight ?? ""}
                    onChange={(e) =>
                      updateTemplate({
                        minHeight: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </span>
                <span className="cd-ctrl">
                  <label>Max H</label>
                  <input
                    type="number"
                    min={0}
                    max={1200}
                    step={20}
                    placeholder="—"
                    value={template.maxHeight ?? ""}
                    onChange={(e) =>
                      updateTemplate({
                        maxHeight: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </span>
                <span className="cd-range-label">Radius</span>
                <div className="cd-range-row" style={{ flex: 1, minWidth: 80 }}>
                  <input
                    type="range"
                    min={0}
                    max={32}
                    step={1}
                    value={template.borderRadius ?? 16}
                    onChange={(e) =>
                      updateTemplate({ borderRadius: Number(e.target.value) })
                    }
                  />
                  <span className="cd-range-value">
                    {template.borderRadius ?? 16}px
                  </span>
                </div>
              </div>

              <div className="card-designer__style-grid">
                {CARD_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`card-designer__style-btn${
                      template.cardStyle === opt.value ? " active" : ""
                    }`}
                    onClick={() => updateTemplate({ cardStyle: opt.value })}
                    title={opt.hint}
                  >
                    <span className="card-designer__style-preview">
                      <span
                        className={`card-designer__style-chip card-designer__style-chip--${opt.value}`}
                      />
                    </span>
                    <span className="card-designer__style-name">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card-designer__section">
          <button
            type="button"
            className={`card-designer__section-toggle${openSections.has("spacing") ? " expanded" : ""}`}
            onClick={() => toggleSection("spacing")}
          >
            <div>
              <span className="card-designer__group-heading">Spacing</span>
              <span className="card-designer__group-note">
                Grid + padding controls
              </span>
            </div>
            <ChevronDown size={16} />
          </button>

          {openSections.has("spacing") && (
            <div className="card-designer__section-body">
              <div className="cd-ctrl-row">
                <span className="cd-ctrl">
                  <label>Grid</label>
                  <input
                    type="number"
                    min={0}
                    max={64}
                    step={4}
                    value={template.gridGap ?? 24}
                    onChange={(e) =>
                      updateTemplate({ gridGap: Number(e.target.value) })
                    }
                  />
                </span>
                <span className="cd-ctrl">
                  <label>Zone</label>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    step={2}
                    value={template.gap}
                    onChange={(e) =>
                      updateTemplate({ gap: Number(e.target.value) })
                    }
                  />
                </span>
                <span className="cd-ctrl">
                  <label>Img pos</label>
                  <select
                    value={template.imagePosition}
                    onChange={(e) =>
                      updateTemplate({
                        imagePosition: e.target.value as ImagePosition,
                      })
                    }
                  >
                    {IMAGE_POSITION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="cd-ctrl">
                  <label>Img H</label>
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={20}
                    placeholder="—"
                    value={template.imageHeight ?? ""}
                    onChange={(e) =>
                      updateTemplate({
                        imageHeight: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </span>
              </div>

              <BoxSpacingControls
                label="Margin"
                values={{
                  top: template.marginTop ?? 0,
                  right: template.marginRight ?? 0,
                  bottom: template.marginBottom ?? 0,
                  left: template.marginLeft ?? 0,
                }}
                onChange={(next) =>
                  updateTemplate({
                    marginTop: next.top,
                    marginRight: next.right,
                    marginBottom: next.bottom,
                    marginLeft: next.left,
                  })
                }
              />

              <BoxSpacingControls
                label="Padding"
                values={{
                  top: template.paddingTop,
                  right: template.paddingRight,
                  bottom: template.paddingBottom,
                  left: template.paddingLeft,
                }}
                onChange={(next) =>
                  updateTemplate({
                    paddingTop: next.top,
                    paddingRight: next.right,
                    paddingBottom: next.bottom,
                    paddingLeft: next.left,
                  })
                }
              />
            </div>
          )}
        </div>

        {mode === "table" && (
          <div className="card-designer__section">
            <button
              type="button"
              className={`card-designer__section-toggle${openSections.has("table-style") ? " expanded" : ""}`}
              onClick={() => toggleSection("table-style")}
            >
              <div>
                <span className="card-designer__group-heading">
                  Table style
                </span>
                <span className="card-designer__group-note">
                  Configure table row and header appearance
                </span>
              </div>
              <ChevronDown size={16} />
            </button>

            {openSections.has("table-style") && (
              <div className="card-designer__section-body">
                <div className="cd-ctrl-row">
                  <button
                    type="button"
                    className={`cd-toggle${template.tableStriped ? " active" : ""}`}
                    onClick={() =>
                      updateTemplate({ tableStriped: !template.tableStriped })
                    }
                  >
                    <span className="cd-toggle__dot" />
                    Striped
                  </button>
                  <button
                    type="button"
                    className={`cd-toggle${template.tableHover ? " active" : ""}`}
                    onClick={() =>
                      updateTemplate({ tableHover: !template.tableHover })
                    }
                  >
                    <span className="cd-toggle__dot" />
                    Hover
                  </button>
                  <button
                    type="button"
                    className={`cd-toggle${template.tableBordered ? " active" : ""}`}
                    onClick={() =>
                      updateTemplate({ tableBordered: !template.tableBordered })
                    }
                  >
                    <span className="cd-toggle__dot" />
                    Bordered
                  </button>
                  <button
                    type="button"
                    className={`cd-toggle${template.tableCompact ? " active" : ""}`}
                    onClick={() =>
                      updateTemplate({ tableCompact: !template.tableCompact })
                    }
                  >
                    <span className="cd-toggle__dot" />
                    Compact
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card-designer__section">
          <button
            type="button"
            className={`card-designer__section-toggle${openSections.has("custom-css") ? " expanded" : ""}`}
            onClick={() => toggleSection("custom-css")}
          >
            <div>
              <span className="card-designer__group-heading">Custom CSS</span>
              <span className="card-designer__group-note">
                Monaco-powered stylesheet editor for the card or table preview
              </span>
            </div>
            <ChevronDown size={16} />
          </button>

          {openSections.has("custom-css") && (
            <div className="card-designer__section-body">
              <div className="card-designer__field card-designer__field--wide">
                <span>CSS</span>
                <div className="card-designer__css-editor-wrapper">
                  <Suspense
                    fallback={
                      <div className="card-designer__css-editor-fallback">
                        Loading editor…
                      </div>
                    }
                  >
                    <MonacoEditor
                      height={260}
                      language="css"
                      code={template.customCss ?? ""}
                      onChange={(v: string) => updateTemplate({ customCss: v })}
                      editable
                    />
                  </Suspense>
                </div>
                <span className="card-designer__field-note">
                  Use <code>.dcard--custom-css</code> to scope custom rules to
                  the rendered card or table.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card-designer__section">
          <button
            type="button"
            className={`card-designer__section-toggle${openSections.has("zones") ? " expanded" : ""}`}
            onClick={() => toggleSection("zones")}
          >
            <div>
              <span className="card-designer__group-heading">Zones</span>
              <span className="card-designer__group-note">
                Drag, reorder, align and toggle fields
              </span>
            </div>
            <ChevronDown size={16} />
          </button>

          {openSections.has("zones") && (
            <div className="card-designer__section-body">
              <div className="card-designer__zones">
                <div className="card-designer__zones-header">
                  <span>Content Zones</span>
                  <span className="card-designer__zones-hint">
                    Drag to reorder · toggle visibility
                  </span>
                </div>

                {bodyZoneIndices.map(({ zone, originalIndex }, visualIndex) => {
                  const FieldIcon = FIELD_ICONS[zone.field];
                  const isDragging = dragIndex === originalIndex;
                  const isDragOver = dragOverIndex === originalIndex;

                  return (
                    <div
                      key={zone.field}
                      className={`card-designer__zone${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}${!zone.visible ? " hidden-zone" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, originalIndex)}
                      onDragOver={(e) => handleDragOver(e, originalIndex)}
                      onDrop={(e) => handleDrop(e, originalIndex)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className="card-designer__zone-grip">
                        <GripVertical size={14} />
                      </span>

                      <span className="card-designer__zone-icon">
                        <FieldIcon size={14} />
                      </span>

                      <span className="card-designer__zone-label">
                        {MAPPABLE_FIELD_LABELS[zone.field]}
                      </span>

                      <div className="card-designer__zone-align">
                        {(["left", "center", "right"] as ZoneAlign[]).map(
                          (a) => (
                            <button
                              key={a}
                              type="button"
                              className={`icon-btn icon-btn--xs${zone.align === a ? " icon-btn--active" : ""}`}
                              onClick={() =>
                                updateZone(originalIndex, { align: a })
                              }
                              title={`Align ${a}`}
                            >
                              {a === "left" && <AlignLeft size={12} />}
                              {a === "center" && <AlignCenter size={12} />}
                              {a === "right" && <AlignRight size={12} />}
                            </button>
                          ),
                        )}
                      </div>

                      <div className="card-designer__zone-size">
                        {ZONE_SIZE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`card-designer__size-btn${zone.size === opt.value ? " active" : ""}`}
                            onClick={() =>
                              updateZone(originalIndex, { size: opt.value })
                            }
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="icon-btn icon-btn--xs"
                        disabled={visualIndex === 0}
                        onClick={() => {
                          const prevOriginal =
                            bodyZoneIndices[visualIndex - 1]?.originalIndex;
                          if (prevOriginal !== undefined)
                            moveZone(originalIndex, prevOriginal);
                        }}
                        title="Move up"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--xs"
                        disabled={visualIndex === bodyZoneIndices.length - 1}
                        onClick={() => {
                          const nextOriginal =
                            bodyZoneIndices[visualIndex + 1]?.originalIndex;
                          if (nextOriginal !== undefined)
                            moveZone(originalIndex, nextOriginal);
                        }}
                        title="Move down"
                      >
                        <ChevronDown size={12} />
                      </button>

                      <button
                        type="button"
                        className={`icon-btn icon-btn--xs${zone.visible ? "" : " icon-btn--danger"}`}
                        onClick={() =>
                          updateZone(originalIndex, { visible: !zone.visible })
                        }
                        title={zone.visible ? "Hide zone" : "Show zone"}
                      >
                        {zone.visible ? (
                          <Eye size={12} />
                        ) : (
                          <EyeOff size={12} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

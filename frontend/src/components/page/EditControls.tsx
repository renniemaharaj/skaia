import { ICON_MAP, ICON_NAMES } from "./iconMap";
import type { PageItem } from "./types";
import "./page-builder-core.css";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Maximize2,
  Pencil,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import Button from "../ui/Button";
import Select from "../ui/Select";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import { ColorPickerButton } from "./MediaEditControls";
import type { SectionEditor } from "./types";

import {
  ANIMATION_INTENSITIES,
  type AnimationIntensity,
  type BoxSpacingValues,
  SECTION_ANIMATIONS,
  type SectionAnimation,
  type SectionLayout,
  type SectionMargins,
} from "./sectionConfig";
export * from "./sectionConfig";

export interface SectionMoveContextValue {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  lastEditedBy?: SectionEditor;
  onCopy?: () => void;
  onCut?: () => void;
  frameOwnsToolbar?: boolean;
  toolbarExtraTarget?: Element | null;
}

export const SectionMoveContext = createContext<SectionMoveContextValue>({
  canMoveUp: false,
  canMoveDown: false,
});

export const SectionMoveButtons = () => {
  const { onMoveUp, onMoveDown, canMoveUp, canMoveDown } = useContext(SectionMoveContext);
  if (!onMoveUp && !onMoveDown) return null;

  return (
    <span className="pb-section-move-btns">
      <button
        className="pb-section-toolbar-btn"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        title="Move section up"
        aria-label="Move section up"
        type="button"
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="pb-section-toolbar-btn"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        title="Move section down"
        aria-label="Move section down"
        type="button"
      >
        <ChevronDown size={14} />
      </button>
    </span>
  );
};

export const SectionLayoutControls = ({
  layout,
  onChange,
}: {
  layout: SectionLayout;
  onChange: (layout: SectionLayout) => void;
}) => (
  <div className="section-layout-controls">
    <button
      className={`layout-control-btn${layout === "left" ? " active" : ""}`}
      onClick={() => onChange("left")}
      aria-pressed={layout === "left"}
      title="Align left"
    >
      <AlignLeft size={14} />
    </button>
    <button
      className={`layout-control-btn${layout === "center" ? " active" : ""}`}
      onClick={() => onChange("center")}
      aria-pressed={layout === "center"}
      title="Align center"
    >
      <AlignCenter size={14} />
    </button>
    <button
      className={`layout-control-btn${layout === "right" ? " active" : ""}`}
      onClick={() => onChange("right")}
      aria-pressed={layout === "right"}
      title="Align right"
    >
      <AlignRight size={14} />
    </button>
    <button
      className={`layout-control-btn${layout === "wide" ? " active" : ""}`}
      onClick={() => onChange("wide")}
      aria-pressed={layout === "wide"}
      title="Wide"
    >
      <Maximize2 size={14} />
    </button>
  </div>
);

/** Controls for section top/bottom margins and left/right padding. */
export const SectionSpacingControls = ({
  margins,
  onChange,
}: {
  margins: SectionMargins;
  onChange: (m: Partial<SectionMargins>) => void;
}) => {
  const [draftMargins, setDraftMargins] = useState<SectionMargins>(margins);

  useEffect(() => {
    setDraftMargins(margins);
  }, [margins]);

  const changed =
    draftMargins.marginTop !== margins.marginTop ||
    draftMargins.marginRight !== margins.marginRight ||
    draftMargins.marginBottom !== margins.marginBottom ||
    draftMargins.marginLeft !== margins.marginLeft ||
    draftMargins.paddingTop !== margins.paddingTop ||
    draftMargins.paddingRight !== margins.paddingRight ||
    draftMargins.paddingBottom !== margins.paddingBottom ||
    draftMargins.paddingLeft !== margins.paddingLeft;

  return (
    <div className="section-spacing-capture">
      <div className="section-spacing-group">
        <span className="section-spacing-pair">
          <label>PT</label>
          <input
            type="number"
            value={draftMargins.paddingTop}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                paddingTop: Number(e.target.value),
              }))
            }
            title="Padding top (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
        <span className="section-spacing-pair">
          <label>PB</label>
          <input
            type="number"
            value={draftMargins.paddingBottom}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                paddingBottom: Number(e.target.value),
              }))
            }
            title="Padding bottom (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
        <span className="section-spacing-pair">
          <label>PL</label>
          <input
            type="number"
            value={draftMargins.paddingLeft}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                paddingLeft: Number(e.target.value),
              }))
            }
            title="Padding left (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
        <span className="section-spacing-pair">
          <label>PR</label>
          <input
            type="number"
            value={draftMargins.paddingRight}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                paddingRight: Number(e.target.value),
              }))
            }
            title="Padding right (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
      </div>
      <div className="section-spacing-group">
        <span className="section-spacing-pair">
          <label>MT</label>
          <input
            type="number"
            value={draftMargins.marginTop}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                marginTop: Number(e.target.value),
              }))
            }
            title="Margin top (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
        <span className="section-spacing-pair">
          <label>MB</label>
          <input
            type="number"
            value={draftMargins.marginBottom}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                marginBottom: Number(e.target.value),
              }))
            }
            title="Margin bottom (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
        <span className="section-spacing-pair">
          <label>ML</label>
          <input
            type="number"
            value={draftMargins.marginLeft}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                marginLeft: Number(e.target.value),
              }))
            }
            title="Margin left (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
        <span className="section-spacing-pair">
          <label>MR</label>
          <input
            type="number"
            value={draftMargins.marginRight}
            onChange={e =>
              setDraftMargins(prev => ({
                ...prev,
                marginRight: Number(e.target.value),
              }))
            }
            title="Margin right (px)"
            min={-200}
            max={200}
            step={4}
          />
        </span>
      </div>
      <button
        type="button"
        className={`pb-action-btn section-spacing-capture-btn${changed ? " dirty" : ""}`}
        onClick={() => onChange(draftMargins)}
        disabled={!changed}
        title="Apply spacing"
        aria-label="Apply spacing"
      >
        <Check size={13} />
      </button>
    </div>
  );
};

export const BoxSpacingControls = ({
  label,
  values,
  onChange,
}: {
  label: string;
  values: BoxSpacingValues;
  onChange: (values: BoxSpacingValues) => void;
}) => {
  const [draft, setDraft] = useState<BoxSpacingValues>(values);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  const changed =
    draft.top !== values.top ||
    draft.right !== values.right ||
    draft.bottom !== values.bottom ||
    draft.left !== values.left;

  return (
    <div className="section-spacing-box">
      <div className="section-spacing-box-heading">{label}</div>
      <div className="section-spacing-capture">
        <div className="section-spacing-group">
          <span className="section-spacing-pair">
            <label>T</label>
            <input
              type="number"
              value={draft.top}
              onChange={e =>
                setDraft(prev => ({
                  ...prev,
                  top: Number(e.target.value),
                }))
              }
              title="Top (px)"
              min={-200}
              max={200}
              step={4}
            />
          </span>
          <span className="section-spacing-pair">
            <label>B</label>
            <input
              type="number"
              value={draft.bottom}
              onChange={e =>
                setDraft(prev => ({
                  ...prev,
                  bottom: Number(e.target.value),
                }))
              }
              title="Bottom (px)"
              min={-200}
              max={200}
              step={4}
            />
          </span>
        </div>
        <div className="section-spacing-group">
          <span className="section-spacing-pair">
            <label>L</label>
            <input
              type="number"
              value={draft.left}
              onChange={e =>
                setDraft(prev => ({
                  ...prev,
                  left: Number(e.target.value),
                }))
              }
              title="Left (px)"
              min={-200}
              max={200}
              step={4}
            />
          </span>
          <span className="section-spacing-pair">
            <label>R</label>
            <input
              type="number"
              value={draft.right}
              onChange={e =>
                setDraft(prev => ({
                  ...prev,
                  right: Number(e.target.value),
                }))
              }
              title="Right (px)"
              min={-200}
              max={200}
              step={4}
            />
          </span>
        </div>
        <button
          type="button"
          className={`pb-action-btn section-spacing-capture-btn${changed ? " dirty" : ""}`}
          onClick={() => onChange(draft)}
          disabled={!changed}
          title={`Apply ${label.toLowerCase()}`}
          aria-label={`Apply ${label.toLowerCase()}`}
        >
          <Check size={13} />
        </button>
      </div>
    </div>
  );
};

/** Animation style selector for sections with intensity control. */
export const SectionAnimationControl = ({
  animation,
  onChange,
  intensity,
  onIntensityChange,
}: {
  animation: SectionAnimation;
  onChange: (a: SectionAnimation) => void;
  intensity?: AnimationIntensity;
  onIntensityChange?: (i: AnimationIntensity) => void;
}) => (
  <div className="section-animation-control">
    <Select
      value={animation}
      onChange={e => onChange(e.target.value as SectionAnimation)}
      title="Section animation"
      size="sm"
    >
      {SECTION_ANIMATIONS.map(a => (
        <option key={a} value={a}>
          {a === "none" ? "No animation" : a.replace(/-/g, " ")}
        </option>
      ))}
    </Select>
    {animation !== "none" && onIntensityChange && (
      <div className="section-intensity-control">
        {ANIMATION_INTENSITIES.map(i => (
          <Button
            unstyled
            key={i}
            type="button"
            className={`section-intensity-btn${intensity === i ? " active" : ""}`}
            onClick={() => onIntensityChange(i)}
            title={`${i.charAt(0).toUpperCase() + i.slice(1)} intensity`}
          >
            {i === "subtle" ? "S" : i === "normal" ? "M" : "L"}
          </Button>
        ))}
      </div>
    )}
  </div>
);

/** Inline-editable text - click pencil to edit, Enter/blur to save. */
export const EditableText = ({
  value,
  onSave,
  tag: Tag = "span",
  className = "",
  placeholder = "Click to edit…",
}: {
  value: string;
  onSave: (v: string) => void;
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  className?: string;
  placeholder?: string;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        className="pb-inline-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            setEditing(false);
            if (draft !== value) onSave(draft);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      />
    );
  }

  return (
    <Tag className={className} style={{ cursor: "pointer" }}>
      {value || <em style={{ opacity: 0.4 }}>{placeholder}</em>}
      <button
        className="pb-edit-btn"
        onClick={e => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        onMouseDown={e => e.stopPropagation()}
        title="Edit"
      >
        <Pencil size={12} />
      </button>
    </Tag>
  );
};

/** Icon picker dropdown. */
export const IconPicker = ({
  current,
  onPick,
}: {
  current: string;
  onPick: (name: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const Icon = ICON_MAP[current];

  return (
    <div className="pb-icon-picker">
      <button className="pb-icon-picker-trigger" onClick={() => setOpen(!open)} title="Change icon">
        {Icon ? <Icon size={20} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="pb-icon-picker-dropdown">
          {ICON_NAMES.map(name => {
            const Ic = ICON_MAP[name];
            return (
              <button
                key={name}
                className={`pb-icon-picker-item${name === current ? " active" : ""}`}
                onClick={() => {
                  onPick(name);
                  setOpen(false);
                }}
                title={name}
              >
                <Ic size={18} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Format an ISO timestamp as a relative time string. */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Small avatar + name chip showing who last edited this section. */
const LastEditedByBadge = ({ editor }: { editor: SectionEditor }) => (
  <UserProfileOverlay
    userId={editor.user_id}
    fallbackName={editor.display_name || editor.username}
    fallbackAvatar={editor.avatar_url || undefined}
    disableClick={true}
  >
    <Link
      to={`/users/${editor.user_id}`}
      className="pb-last-edited-badge"
      title={`Last edited by ${editor.display_name || editor.username}${editor.edited_at ? ` · ${new Date(editor.edited_at).toLocaleString()}` : ""}`}
      onClick={e => e.stopPropagation()}
    >
      <UserAvatar
        src={editor.avatar_url || undefined}
        alt={editor.display_name || editor.username}
        size={18}
        initials={(editor.display_name || editor.username)?.[0]?.toUpperCase()}
        className="pb-last-edited-avatar"
      />
      <span className="pb-last-edited-name">{editor.display_name || editor.username}</span>
      {editor.edited_at && (
        <span className="pb-last-edited-time">{formatRelativeTime(editor.edited_at)}</span>
      )}
    </Link>
  </UserProfileOverlay>
);

/** Toolbar for a section: delete, collapsed info, optional extra actions. */
export const SectionToolbar = ({
  onDelete,
  label,
  layout,
  onLayoutChange,
  margins,
  onMarginsChange,
  animation,
  onAnimationChange,
  animationIntensity,
  onAnimationIntensityChange,
  bgColor,
  onBgColorChange,
  extra,
}: {
  onDelete: () => void;
  label: string;
  layout?: SectionLayout;
  onLayoutChange?: (layout: SectionLayout) => void;
  margins?: SectionMargins;
  onMarginsChange?: (m: Partial<SectionMargins>) => void;
  animation?: SectionAnimation;
  onAnimationChange?: (a: SectionAnimation) => void;
  animationIntensity?: AnimationIntensity;
  onAnimationIntensityChange?: (i: AnimationIntensity) => void;
  bgColor?: string;
  onBgColorChange?: (c: string) => void;
  extra?: React.ReactNode;
}) => {
  const { lastEditedBy, onCopy, onCut } = useContext(SectionMoveContext);
  return (
    <div className="pb-section-toolbar">
      <div className="pb-section-toolbar-info">
        <span className="pb-section-toolbar-label">{label}</span>
        {lastEditedBy && <LastEditedByBadge editor={lastEditedBy} />}
      </div>
      <div className="pb-section-toolbar-actions">
        <div className="pb-toolbar-group">
          <SectionMoveButtons />
        </div>
        {(layout || margins) && (
          <div className="pb-toolbar-group">
            {layout && onLayoutChange ? (
              <SectionLayoutControls layout={layout} onChange={onLayoutChange} />
            ) : null}
            {margins && onMarginsChange ? (
              <SectionSpacingControls margins={margins} onChange={onMarginsChange} />
            ) : null}
          </div>
        )}
        {(animation !== undefined || bgColor !== undefined || extra) && (
          <div className="pb-toolbar-group">
            {animation !== undefined && onAnimationChange ? (
              <SectionAnimationControl
                animation={animation}
                onChange={onAnimationChange}
                intensity={animationIntensity}
                onIntensityChange={onAnimationIntensityChange}
              />
            ) : null}
            {bgColor !== undefined && onBgColorChange ? (
              <ColorPickerButton value={bgColor} onChange={onBgColorChange} title="Section color" />
            ) : null}
            {extra}
          </div>
        )}
        <div className="pb-toolbar-group">
          {onCopy && (
            <button
              className="pb-section-toolbar-btn"
              onClick={onCopy}
              title="Copy section"
              aria-label="Copy section"
              type="button"
            >
              <Copy size={14} />
            </button>
          )}
          {onCut && (
            <button
              className="pb-section-toolbar-btn"
              onClick={onCut}
              title="Cut section"
              aria-label="Cut section"
              type="button"
            >
              <Scissors size={14} />
            </button>
          )}
          <button
            className="pb-section-toolbar-btn danger"
            onClick={onDelete}
            title="Remove section"
            aria-label="Remove section"
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

/** Mount renderer-specific actions into the single toolbar owned by SectionFrame. */
export const SectionToolbarActions = ({ children }: { children: React.ReactNode }) => {
  const { frameOwnsToolbar, toolbarExtraTarget } = useContext(SectionMoveContext);
  if (frameOwnsToolbar) {
    return toolbarExtraTarget ? createPortal(children, toolbarExtraTarget) : null;
  }
  return <>{children}</>;
};

/** Add-item button inside a section. */
export const AddItemButton = ({
  onClick,
  label = "Add card",
}: {
  onClick: () => void;
  label?: string;
}) => (
  <button className="pb-add-item-btn" onClick={onClick}>
    <Plus size={16} /> {label}
  </button>
);

/** Delete-item button overlaid on a card. */
export const DeleteItemButton = ({ onClick }: { onClick: () => void }) => (
  <button
    className="pb-delete-item-btn"
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
    title="Remove"
  >
    <Trash2 size={12} />
  </button>
);

/** Helper to create a blank item for a section. */
export function blankItem(sectionId: number, order: number): Omit<PageItem, "id"> {
  return {
    section_id: sectionId,
    display_order: order,
    icon: "",
    heading: "",
    subheading: "",
    image_url: "",
    link_url: "",
    config: "{}",
  };
}
export {
  ColorPickerButton,
  ImagePickerButton,
  VariantCycler,
  VideoPickerButton,
} from "./MediaEditControls";

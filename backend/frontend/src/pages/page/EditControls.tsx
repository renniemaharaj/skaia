import { ICON_MAP, ICON_NAMES } from "./iconMap";
import type { PageItem } from "./types";
import "./page-builder-core.css";
import {
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Loader2,
  RefreshCw,
  Video,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Check,
} from "lucide-react";
import type { SectionEditor } from "./types";
import { Link } from "react-router-dom";
import UserAvatar from "../../components/user/UserAvatar";
import { useRef, useContext, useEffect, useState, createContext } from "react";
import { debounce } from "lodash";
import { usePageBuilderContext } from "./PageBuilderContext";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";

export type SectionLayout = "center" | "left" | "right" | "wide";

export interface SectionMoveContextValue {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  lastEditedBy?: SectionEditor;
}

export const SectionMoveContext = createContext<SectionMoveContextValue>({
  canMoveUp: false,
  canMoveDown: false,
});

export const SectionMoveButtons = () => {
  const { onMoveUp, onMoveDown, canMoveUp, canMoveDown } =
    useContext(SectionMoveContext);
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

function safeParseConfig(config: string): Record<string, any> {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

export function getSectionLayout(config: string): SectionLayout {
  const parsed = safeParseConfig(config);
  if (["left", "center", "right", "wide"].includes(parsed.layout)) {
    return parsed.layout;
  }
  if (parsed.wide) return "wide";
  return "center";
}

export function setSectionLayout(
  config: string,
  nextLayout: SectionLayout,
): string {
  const parsed = safeParseConfig(config);
  const updated = { ...parsed, layout: nextLayout };
  if ("wide" in updated) delete updated.wide;
  return JSON.stringify(updated);
}

// ── Margin helpers ──────────────────────────────────────────────────────────

export interface SectionMargins {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export interface BoxSpacingValues {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getSectionMargins(config: string): SectionMargins {
  const parsed = safeParseConfig(config);
  return {
    marginTop: parsed.marginTop ?? 0,
    marginRight: parsed.marginRight ?? 0,
    marginBottom: parsed.marginBottom ?? 0,
    marginLeft: parsed.marginLeft ?? 0,
    paddingTop: parsed.paddingTop ?? 0,
    paddingRight: parsed.paddingRight ?? 0,
    paddingBottom: parsed.paddingBottom ?? 0,
    paddingLeft: parsed.paddingLeft ?? 0,
  };
}

export function setSectionMargins(
  config: string,
  margins: Partial<SectionMargins>,
): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, ...margins });
}

// ── Animation helpers ───────────────────────────────────────────────────────

export const SECTION_ANIMATIONS = [
  "none",
  "fade-in",
  "slide-up",
  "slide-left",
  "slide-right",
  "zoom-in",
  "bounce",
] as const;

export type SectionAnimation = (typeof SECTION_ANIMATIONS)[number];

export function getSectionAnimation(config: string): SectionAnimation {
  const parsed = safeParseConfig(config);
  if (SECTION_ANIMATIONS.includes(parsed.animation)) return parsed.animation;
  return "none";
}

export function setSectionAnimation(
  config: string,
  animation: SectionAnimation,
): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, animation });
}

// ── Animation intensity helpers ─────────────────────────────────────────────

export const ANIMATION_INTENSITIES = ["subtle", "normal", "dramatic"] as const;
export type AnimationIntensity = (typeof ANIMATION_INTENSITIES)[number];

export function getSectionAnimationIntensity(
  config: string,
): AnimationIntensity {
  const parsed = safeParseConfig(config);
  if (ANIMATION_INTENSITIES.includes(parsed.animationIntensity))
    return parsed.animationIntensity;
  return "normal";
}

export function setSectionAnimationIntensity(
  config: string,
  intensity: AnimationIntensity,
): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, animationIntensity: intensity });
}

// ── Background color helpers ────────────────────────────────────────────────

export function getSectionBgColor(config: string): string {
  const parsed = safeParseConfig(config);
  return parsed.bg_color ?? "";
}

export function setSectionBgColor(config: string, color: string): string {
  const parsed = safeParseConfig(config);
  return JSON.stringify({ ...parsed, bg_color: color });
}

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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
            onChange={(e) =>
              setDraftMargins((prev) => ({
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
        className={`pb-action-btn section-spacing-capture-btn${
          changed ? " dirty" : ""
        }`}
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
              onChange={(e) =>
                setDraft((prev) => ({
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
              onChange={(e) =>
                setDraft((prev) => ({
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
              onChange={(e) =>
                setDraft((prev) => ({
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
              onChange={(e) =>
                setDraft((prev) => ({
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
          className={`pb-action-btn section-spacing-capture-btn${
            changed ? " dirty" : ""
          }`}
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
    <select
      value={animation}
      onChange={(e) => onChange(e.target.value as SectionAnimation)}
      title="Section animation"
    >
      {SECTION_ANIMATIONS.map((a) => (
        <option key={a} value={a}>
          {a === "none" ? "No animation" : a.replace(/-/g, " ")}
        </option>
      ))}
    </select>
    {animation !== "none" && onIntensityChange && (
      <div className="section-intensity-control">
        {ANIMATION_INTENSITIES.map((i) => (
          <button
            key={i}
            type="button"
            className={`section-intensity-btn${intensity === i ? " active" : ""}`}
            onClick={() => onIntensityChange(i)}
            title={`${i.charAt(0).toUpperCase() + i.slice(1)} intensity`}
          >
            {i === "subtle" ? "S" : i === "normal" ? "M" : "L"}
          </button>
        ))}
      </div>
    )}
  </div>
);

/** Inline-editable text — click pencil to edit, Enter/blur to save. */
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
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            if (draft !== value) onSave(draft);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <Tag className={className} style={{ cursor: "pointer" }}>
      {value || <em style={{ opacity: 0.4 }}>{placeholder}</em>}
      <button
        className="pb-edit-btn"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
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
      <button
        className="pb-icon-picker-trigger"
        onClick={() => setOpen(!open)}
        title="Change icon"
      >
        {Icon ? <Icon size={20} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="pb-icon-picker-dropdown">
          {ICON_NAMES.map((name) => {
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
  <Link
    to={`/u/${editor.username}`}
    className="pb-last-edited-badge"
    title={`Last edited by ${editor.display_name || editor.username}${editor.edited_at ? ` · ${new Date(editor.edited_at).toLocaleString()}` : ""}`}
    onClick={(e) => e.stopPropagation()}
  >
    <UserAvatar
      src={editor.avatar_url || undefined}
      alt={editor.display_name || editor.username}
      size={18}
      initials={(editor.display_name || editor.username)?.[0]?.toUpperCase()}
      className="pb-last-edited-avatar"
    />
    <span className="pb-last-edited-name">
      {editor.display_name || editor.username}
    </span>
    {editor.edited_at && (
      <span className="pb-last-edited-time">
        {formatRelativeTime(editor.edited_at)}
      </span>
    )}
  </Link>
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
  const { lastEditedBy } = useContext(SectionMoveContext);
  return (
    <div className="pb-section-toolbar">
      <span className="pb-section-toolbar-label">{label}</span>
      {lastEditedBy && <LastEditedByBadge editor={lastEditedBy} />}
      <div className="pb-section-toolbar-actions">
        <SectionMoveButtons />
        {layout && onLayoutChange ? (
          <SectionLayoutControls layout={layout} onChange={onLayoutChange} />
        ) : null}
        {margins && onMarginsChange ? (
          <SectionSpacingControls
            margins={margins}
            onChange={onMarginsChange}
          />
        ) : null}
        {animation !== undefined && onAnimationChange ? (
          <SectionAnimationControl
            animation={animation}
            onChange={onAnimationChange}
            intensity={animationIntensity}
            onIntensityChange={onAnimationIntensityChange}
          />
        ) : null}
        {bgColor !== undefined && onBgColorChange ? (
          <ColorPickerButton
            value={bgColor}
            onChange={onBgColorChange}
            title="Section color"
          />
        ) : null}
        {extra}
        <button
          className="pb-section-toolbar-btn danger"
          onClick={onDelete}
          title="Remove section"
          type="button"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
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
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title="Remove"
  >
    <Trash2 size={12} />
  </button>
);

/** Helper to create a blank item for a section. */
export function blankItem(
  sectionId: number,
  order: number,
): Omit<PageItem, "id"> {
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

/**
 * Image picker button — click to open file dialog, uploads via /upload/image,
 * returns the URL to the caller. Does NOT wrap children — just renders a button.
 * Parent handles positioning via className.
 */
export const ImagePickerButton = ({
  onUploaded,
  className = "",
}: {
  onUploaded: (url: string) => void;
  className?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP or GIF images are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "landing");
      const res = await apiRequest<{ url: string }>("/upload/image", {
        method: "POST",
        body: fd,
      });
      onUploaded(res.url);
      toast.success("Image uploaded");
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        className={`pb-action-btn ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!uploading) inputRef.current?.click();
        }}
        title="Change image"
      >
        {uploading ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <ImageIcon size={14} />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
};

/**
 * Video picker button — same pattern as ImagePickerButton but accepts video files.
 * Uploads via /upload/video.
 */
export const VideoPickerButton = ({
  onUploaded,
  className = "",
}: {
  onUploaded: (url: string) => void;
  className?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    const validTypes = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
    ];
    if (!validTypes.includes(file.type)) {
      toast.error("Only MP4, WebM, OGG or MOV videos are allowed");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video must be under 50 MB");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "landing");
      const res = await apiRequest<{ url: string }>("/upload/video", {
        method: "POST",
        body: fd,
      });
      onUploaded(res.url);
      toast.success("Video uploaded");
    } catch {
      toast.error("Video upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        className={`pb-action-btn ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!uploading) inputRef.current?.click();
        }}
        title="Upload video"
      >
        {uploading ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <Video size={14} />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        accept="video/mp4,video/webm,video/ogg,video/quicktime"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
};

/** Inline color picker — renders a small swatch that opens a native color input. */
export const ColorPickerButton = ({
  value,
  onChange,
  className = "",
  title = "Pick color",
}: {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  title?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const isActiveRef = useRef(false);
  const debouncedOnChange = useRef(debounce((c: string) => onChange(c), 150));
  const { enterEdit, leaveEdit } = usePageBuilderContext();

  // Keep the swatch in sync with external prop when not actively picking
  useEffect(() => {
    if (!isActiveRef.current) setLocalValue(value);
  }, [value]);

  return (
    <button
      className={`pb-action-btn pb-color-picker ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.click();
      }}
      title={title}
      style={{ position: "relative" }}
    >
      <Palette size={14} />
      <span
        className="pb-color-swatch"
        style={{ backgroundColor: localValue || "rgba(0,0,0,0.5)" }}
      />
      <input
        ref={inputRef}
        type="color"
        value={localValue || "#000000"}
        onFocus={() => {
          isActiveRef.current = true;
          enterEdit();
        }}
        onBlur={() => {
          isActiveRef.current = false;
          debouncedOnChange.current.flush();
          leaveEdit();
        }}
        onChange={(e) => {
          setLocalValue(e.target.value);
          debouncedOnChange.current(e.target.value);
        }}
        style={{
          position: "absolute",
          opacity: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      />
    </button>
  );
};

/** Cycle button for switching between style variants (header, footer, etc.). */
export const VariantCycler = ({
  current,
  total,
  onCycle,
  label,
}: {
  current: number;
  total: number;
  onCycle: (v: number) => void;
  label: string;
}) => (
  <button
    className="pb-variant-cycler"
    onClick={(e) => {
      e.stopPropagation();
      e.preventDefault();
      onCycle((current % total) + 1);
    }}
    title={`Switch ${label} style (${current}/${total})`}
  >
    <RefreshCw size={12} />
    <span>
      Style {current}/{total}
    </span>
  </button>
);

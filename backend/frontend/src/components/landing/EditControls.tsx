import { ICON_MAP, ICON_NAMES } from "./iconMap";
import type { LandingItem } from "./types";
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
} from "lucide-react";
import { useRef, useContext, useState, createContext } from "react";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";

export type SectionLayout = "center" | "left" | "right" | "wide";

export interface SectionMoveContextValue {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
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
    <span className="landing-section-move-btns">
      <button
        className="landing-section-toolbar-btn"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        title="Move section up"
        aria-label="Move section up"
        type="button"
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="landing-section-toolbar-btn"
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
        className="landing-inline-input"
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
        className="landing-edit-btn"
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
    <div className="landing-icon-picker">
      <button
        className="landing-icon-picker-trigger"
        onClick={() => setOpen(!open)}
        title="Change icon"
      >
        {Icon ? <Icon size={20} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="landing-icon-picker-dropdown">
          {ICON_NAMES.map((name) => {
            const Ic = ICON_MAP[name];
            return (
              <button
                key={name}
                className={`landing-icon-picker-item${name === current ? " active" : ""}`}
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

/** Toolbar for a section: delete, collapsed info, optional extra actions. */
export const SectionToolbar = ({
  onDelete,
  label,
  layout,
  onLayoutChange,
  extra,
}: {
  onDelete: () => void;
  label: string;
  layout?: SectionLayout;
  onLayoutChange?: (layout: SectionLayout) => void;
  extra?: React.ReactNode;
}) => (
  <div className="landing-section-toolbar">
    <span className="landing-section-toolbar-label">{label}</span>
    <div className="landing-section-toolbar-actions">
      <SectionMoveButtons />
      {layout && onLayoutChange ? (
        <SectionLayoutControls layout={layout} onChange={onLayoutChange} />
      ) : null}
      {extra}
      <button
        className="landing-section-toolbar-btn danger"
        onClick={onDelete}
        title="Remove section"
        type="button"
      >
        <Trash2 size={14} />
      </button>
    </div>
  </div>
);

/** Add-item button inside a section. */
export const AddItemButton = ({
  onClick,
  label = "Add card",
}: {
  onClick: () => void;
  label?: string;
}) => (
  <button className="landing-add-item-btn" onClick={onClick}>
    <Plus size={16} /> {label}
  </button>
);

/** Delete-item button overlaid on a card. */
export const DeleteItemButton = ({ onClick }: { onClick: () => void }) => (
  <button
    className="landing-delete-item-btn"
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
): Omit<LandingItem, "id"> {
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
        className={`landing-action-btn ${className}`}
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
        className={`landing-action-btn ${className}`}
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

  return (
    <button
      className={`landing-action-btn landing-color-picker ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.click();
      }}
      title={title}
      style={{ position: "relative" }}
    >
      <Palette size={14} />
      <span
        className="landing-color-swatch"
        style={{ backgroundColor: value || "rgba(0,0,0,0.5)" }}
      />
      <input
        ref={inputRef}
        type="color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
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
    className="landing-variant-cycler"
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

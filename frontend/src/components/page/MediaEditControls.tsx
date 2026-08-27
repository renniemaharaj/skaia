import { debounce } from "lodash";
import { ImageIcon, Loader2, Palette, RefreshCw, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploader } from "../../atoms/uploadAtom";
import Button from "../ui/Button";
import { usePageBuilderContext } from "./PageBuilderContext";

/**
 * Image picker button - click to open file dialog, uploads via /upload/image,
 * returns the URL to the caller. Does NOT wrap children - just renders a button.
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
      const res = await uploader.upload(file, { uploadType: "image" });
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
      <Button
        type="button"
        className={`pb-action-btn ${className}`}
        onClick={e => {
          e.stopPropagation();
          if (!uploading) inputRef.current?.click();
        }}
        title="Change image"
      >
        {uploading ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
};

/**
 * Video picker button - same pattern as ImagePickerButton but accepts video files.
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
    const validTypes = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
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
      const res = await uploader.upload(file, { uploadType: "video" });
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
      <Button
        className={`pb-action-btn ${className}`}
        onClick={e => {
          e.stopPropagation();
          if (!uploading) inputRef.current?.click();
        }}
        title="Upload video"
      >
        {uploading ? <Loader2 size={14} className="spin" /> : <Video size={14} />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        accept="video/mp4,video/webm,video/ogg,video/quicktime"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
};

/** Inline color picker - renders a small swatch that opens a native color input. */
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
  const onChangeRef = useRef(onChange);
  const debouncedOnChange = useRef(debounce((c: string) => onChangeRef.current(c), 150));
  const { enterEdit, leaveEdit } = usePageBuilderContext();

  const nativeColorValue = (() => {
    const match = /^#([0-9a-f]{3,8})$/i.exec(localValue);
    if (!match) return "#000000";
    const hex = match[1];
    if (hex.length === 3 || hex.length === 4) {
      return `#${[...hex.slice(0, 3)].map(char => char + char).join("")}`;
    }
    if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}`;
    return "#000000";
  })();

  // Keep the swatch in sync with external prop when not actively picking
  useEffect(() => {
    if (!isActiveRef.current) setLocalValue(value);
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => () => debouncedOnChange.current.cancel(), []);

  return (
    <span className="pb-color-picker-wrap">
      <Button
        type="button"
        className={`pb-action-btn pb-color-picker ${className}`}
        onClick={e => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        title={title}
        aria-label={title}
      >
        <Palette size={14} />
        <span
          className="pb-color-swatch"
          style={{ backgroundColor: localValue || "rgba(0,0,0,0.5)" }}
        />
      </Button>
      <input
        ref={inputRef}
        type="color"
        value={nativeColorValue}
        aria-label={`${title} value`}
        onFocus={() => {
          isActiveRef.current = true;
          enterEdit();
        }}
        onBlur={() => {
          isActiveRef.current = false;
          debouncedOnChange.current.flush();
          leaveEdit();
        }}
        onChange={e => {
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
    </span>
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
  <Button
    className="pb-variant-cycler"
    onClick={e => {
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
  </Button>
);

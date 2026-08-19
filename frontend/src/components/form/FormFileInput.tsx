import { useAtomValue } from "jotai";
import { FolderOpen, Image as ImageIcon, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { currentUserAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { MediaPlaceholder } from "../ui/MediaPlaceholder";

export interface UploadLibraryItem {
  url: string;
  filename: string;
  size: number;
  type: string;
  mime_type: string;
  created_at: string;
}

interface FormFileInputProps {
  label: string;
  accept?: string;
  file?: File | null;
  multiple?: boolean;
  mediaType?: "image" | "video" | "any";
  onChange?: (file: File | null) => void;
  onFilesChange?: (files: File[]) => void;
  onSelectUpload?: (upload: UploadLibraryItem) => void;
  inputKey?: string | number;
}

export default function FormFileInput({
  label,
  accept,
  file,
  multiple = false,
  mediaType = "any",
  onChange,
  onFilesChange,
  onSelectUpload,
  inputKey,
}: FormFileInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="managed-file-input">
      <input
        id={inputId}
        ref={inputRef}
        key={inputKey}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={event => {
          const files = Array.from(event.target.files ?? []);
          if (multiple) onFilesChange?.(files);
          else onChange?.(files[0] || null);
          event.target.value = "";
        }}
        aria-label={label}
      />
      <button
        type="button"
        className="managed-file-input__button"
        onClick={() => inputRef.current?.click()}
        aria-label={`Choose local file for ${label}`}
        title="Upload a local file"
      >
        <Upload size={15} /> Upload
      </button>
      {onSelectUpload && (
        <button
          type="button"
          className="managed-file-input__button"
          onClick={() => setPickerOpen(true)}
        >
          <FolderOpen size={15} /> My uploads
        </button>
      )}
      <span className="managed-file-input__name">
        {file?.name || (multiple ? "Select files or choose existing uploads" : "No file selected")}
      </span>
      {pickerOpen && onSelectUpload && (
        <UploadLibraryDialog
          mediaType={mediaType}
          onClose={() => setPickerOpen(false)}
          onSelect={upload => {
            onSelectUpload(upload);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function UploadLibraryDialog({
  mediaType,
  onClose,
  onSelect,
}: {
  mediaType: "image" | "video" | "any";
  onClose: () => void;
  onSelect: (upload: UploadLibraryItem) => void;
}) {
  const currentUser = useAtomValue(currentUserAtom);
  const [uploads, setUploads] = useState<UploadLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!currentUser?.id) {
      setError("Sign in to choose from your uploads.");
      setLoading(false);
      return;
    }
    let active = true;
    apiRequest<UploadLibraryItem[]>(`/upload/user/${currentUser.id}`)
      .then(items => {
        if (active) setUploads(items ?? []);
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load uploads");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  const filtered = uploads.filter(upload => {
    const type = upload.mime_type || upload.type || "";
    if (mediaType === "image") return type.startsWith("image/") || upload.type === "image";
    if (mediaType === "video") return type.startsWith("video/") || upload.type === "video";
    return (
      type.startsWith("image/") ||
      type.startsWith("video/") ||
      ["image", "video"].includes(upload.type)
    );
  });

  return createPortal(
    <div
      className="managed-upload-picker"
      role="presentation"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <section
        className="managed-upload-picker__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="managed-upload-picker-title"
      >
        <header className="managed-upload-picker__header">
          <div>
            <h2 id="managed-upload-picker-title">Choose from your uploads</h2>
            <p>Select an existing {mediaType === "any" ? "image or video" : mediaType}.</p>
          </div>
          <button
            type="button"
            className="action-btn btn-close"
            onClick={onClose}
            aria-label="Close upload picker"
          >
            <X size={18} />
          </button>
        </header>
        {loading && <p className="managed-upload-picker__status">Loading uploads…</p>}
        {error && (
          <p className="managed-upload-picker__status managed-upload-picker__status--error">
            {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="managed-upload-picker__status">No matching uploads found.</p>
        )}
        <div className="managed-upload-picker__grid">
          {filtered.map(upload => {
            const isVideo = upload.mime_type?.startsWith("video/") || upload.type === "video";
            return (
              <button
                key={upload.url}
                type="button"
                className="managed-upload-picker__item"
                onClick={() => onSelect(upload)}
              >
                <MediaPlaceholder
                  href={upload.url}
                  alt={upload.filename}
                  mediaType={isVideo ? "video" : "image"}
                  layout="thumbnail"
                  fit="cover"
                  controls={false}
                  muted
                  preserveFrame
                  showCaption={false}
                  size={{ width: "100%", height: 112 }}
                />
                <span>
                  <ImageIcon size={13} /> {upload.filename}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>,
    document.body
  );
}

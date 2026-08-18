import { Image as ImageIcon, KeyRound, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { uploader } from "../../atoms/uploadAtom";
import type { PageBuilderDoc, PageUser } from "../../hooks/usePageData";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import FormHeaderActions from "../ui/FormHeaderActions";
import PageOwnershipPanel from "./PageOwnershipPanel";
import "./PageManagePanel.css";

export interface PageSEOUpdate {
  seo_title: string;
  seo_description: string;
  seo_image: string;
}

interface PageManagePanelProps {
  page: PageBuilderDoc;
  owner: PageUser | null;
  editors: PageUser[];
  onSaveSEO: (seo: PageSEOUpdate) => Promise<void>;
  onOwnershipUpdate: () => void;
  onClose: () => void;
}

export default function PageManagePanel({
  page,
  owner,
  editors,
  onSaveSEO,
  onOwnershipUpdate,
  onClose,
}: PageManagePanelProps) {
  const [tab, setTab] = useState<"seo" | "access">("seo");
  const [title, setTitle] = useState(page.seo_title || "");
  const [description, setDescription] = useState(page.seo_description || "");
  const [image, setImage] = useState(page.seo_image || "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(page.seo_title || "");
    setDescription(page.seo_description || "");
    setImage(page.seo_image || "");
    setImageFile(null);
    setFileInputKey(value => value + 1);
  }, [page.id, page.seo_title, page.seo_description, page.seo_image]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile]);

  const initial = {
    seo_title: page.seo_title || "",
    seo_description: page.seo_description || "",
    seo_image: page.seo_image || "",
  };
  const current = {
    seo_title: title.trim(),
    seo_description: description.trim(),
    seo_image: image.trim(),
  };
  const dirty =
    !!imageFile ||
    Object.keys(current).some(
      key => current[key as keyof PageSEOUpdate] !== initial[key as keyof PageSEOUpdate]
    );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      let seoImage = current.seo_image;
      if (imageFile) {
        const uploaded = await uploader.upload(imageFile, { uploadType: "image" });
        seoImage = uploaded.url;
      }
      await onSaveSEO({ ...current, seo_image: seoImage });
      setImage(seoImage);
      setImageFile(null);
      setFileInputKey(value => value + 1);
      toast.success("Page SEO saved");
      onClose();
    } catch {
      toast.error("Could not save page SEO");
    } finally {
      setSaving(false);
    }
  };

  const clearOverrides = () => {
    setTitle("");
    setDescription("");
    setImage("");
    setImageFile(null);
    setFileInputKey(value => value + 1);
  };

  return (
    <ContentFlatCard className="page-manage">
      <div className="page-manage__topbar">
        <div>
          <span className="page-manage__eyebrow">Page settings</span>
          <h2>Manage page</h2>
        </div>
        <FormHeaderActions
          formId="page-seo-form"
          onCancel={onClose}
          confirmDisabled={tab !== "seo" || !dirty}
          saving={saving}
          cancelLabel="Close page settings"
          confirmLabel="Save page SEO"
        />
      </div>

      <div className="page-manage__tabs" role="tablist" aria-label="Page management">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "seo"}
          className={tab === "seo" ? "active" : ""}
          onClick={() => setTab("seo")}
        >
          <Search size={15} /> SEO
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "access"}
          className={tab === "access" ? "active" : ""}
          onClick={() => setTab("access")}
        >
          <KeyRound size={15} /> Access
        </button>
      </div>

      {tab === "seo" ? (
        <form id="page-seo-form" className="page-manage__seo" onSubmit={save}>
          <div className="page-manage__intro">
            <div className="page-manage__intro-icon">
              <Search size={18} />
            </div>
            <div>
              <h3>Search & social preview</h3>
              <p>
                Overrides are optional. Empty fields use page content first, then official site SEO.
              </p>
            </div>
          </div>

          <label className="page-manage__field">
            <span>
              <strong>SEO title</strong>
              <small>{title.length}/60 recommended</small>
            </span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={255}
              placeholder={page.title || "Derived from the page title"}
            />
            <small>Displayed in search results and link previews.</small>
          </label>

          <label className="page-manage__field">
            <span>
              <strong>SEO description</strong>
              <small>{description.length}/160 recommended</small>
            </span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder={page.description || "Derived from page sections and rich text"}
            />
            <small>Summarize this page clearly; longer text is trimmed for metadata.</small>
          </label>

          <div className="page-manage__field">
            <span>
              <strong>Social image</strong>
              <small>1200 × 630 recommended</small>
            </span>
            <div className="page-manage__image-row">
              <input
                value={image}
                onChange={event => {
                  setImage(event.target.value);
                  setImageFile(null);
                  setFileInputKey(value => value + 1);
                }}
                maxLength={2048}
                placeholder="Image URL or upload below"
                aria-label="Social image URL"
              />
              <button
                type="button"
                className="action-btn danger page-manage__clear-image"
                onClick={() => {
                  setImage("");
                  setImageFile(null);
                  setFileInputKey(value => value + 1);
                }}
                disabled={!image && !imageFile}
                title="Reset social image"
                aria-label="Reset social image"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              key={fileInputKey}
              className="page-manage__file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={event => setImageFile(event.target.files?.[0] || null)}
              aria-label="Upload social image"
            />
            <div
              className={`page-manage__image-preview${imagePreview || image ? " has-image" : ""}`}
            >
              {imagePreview || image ? (
                <img src={imagePreview || image} alt="Custom social preview" />
              ) : (
                <div>
                  <ImageIcon size={24} />
                  <span>Automatic image</span>
                  <small>Hero, gallery, page media, or site SEO</small>
                </div>
              )}
            </div>
          </div>

          <div className="page-manage__actions">
            <button
              type="button"
              className="page-manage__reset"
              onClick={clearOverrides}
              disabled={!title && !description && !image}
            >
              <RotateCcw size={14} /> Use automatic SEO
            </button>
          </div>
        </form>
      ) : (
        <div className="page-manage__access">
          <div className="page-manage__intro">
            <div className="page-manage__intro-icon">
              <KeyRound size={18} />
            </div>
            <div>
              <h3>Ownership & editors</h3>
              <p>Control who owns this page and who can edit its content.</p>
            </div>
          </div>
          <PageOwnershipPanel
            pageId={page.id}
            owner={owner}
            editors={editors}
            onUpdate={onOwnershipUpdate}
          />
        </div>
      )}
    </ContentFlatCard>
  );
}

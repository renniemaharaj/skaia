import { Image as ImageIcon, KeyRound, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { uploader } from "../../atoms/uploadAtom";
import type { PageBuilderDoc, PageUser } from "../../hooks/usePageData";
import { FormField, FormFileInput, FormSectionIntro, ManagedForm } from "../form";
import PageOwnershipPanel from "./PageOwnershipPanel";
import "./PageManagePanel.css";

export interface PageSEOUpdate {
  seo_title: string;
  seo_description: string;
  seo_image: string;
}

interface PageSEOValues extends PageSEOUpdate {
  imageFile: File | null;
}

interface PageManagePanelProps {
  page: PageBuilderDoc;
  owner: PageUser | null;
  editors: PageUser[];
  onSaveSEO: (seo: PageSEOUpdate) => Promise<void>;
  onOwnershipUpdate: () => void;
  onClose?: () => void;
  cancelTo?: string;
}

export default function PageManagePanel({
  page,
  owner,
  editors,
  onSaveSEO,
  onOwnershipUpdate,
  onClose,
  cancelTo,
}: PageManagePanelProps) {
  const [tab, setTab] = useState<"seo" | "access">("seo");
  const [imagePreview, setImagePreview] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    setFileInputKey(value => value + 1);
  }, [page.id]);

  return (
    <ManagedForm<PageSEOValues>
      id="page-seo-form"
      title="Manage page"
      eyebrow="Page settings"
      initialValues={{
        seo_title: page.seo_title || "",
        seo_description: page.seo_description || "",
        seo_image: page.seo_image || "",
        imageFile: null,
      }}
      enableReinitialize
      {...(cancelTo ? { cancelTo } : { onCancel: onClose! })}
      cancelLabel="Close page settings"
      submitLabel="Save page SEO"
      className="page-manage"
      formClassName={tab === "seo" ? "page-manage__seo" : "page-manage__access"}
      tabsLabel="Page management"
      tabs={[
        {
          id: "seo",
          label: "SEO",
          icon: <Search size={15} />,
          active: tab === "seo",
          onSelect: () => setTab("seo"),
        },
        {
          id: "access",
          label: "Access",
          icon: <KeyRound size={15} />,
          active: tab === "access",
          onSelect: () => setTab("access"),
        },
      ]}
      submitDisabled={formik => tab !== "seo" || !formik.dirty}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          let seoImage = values.seo_image.trim();
          if (values.imageFile) {
            const uploaded = await uploader.upload(values.imageFile, { uploadType: "image" });
            seoImage = uploaded.url;
          }
          await onSaveSEO({
            seo_title: values.seo_title.trim(),
            seo_description: values.seo_description.trim(),
            seo_image: seoImage,
          });
          toast.success("Page SEO saved");
          onClose?.();
        } catch {
          const message = "Could not save page SEO";
          helpers.setStatus(message);
          toast.error(message);
        }
      }}
    >
      {formik =>
        tab === "seo" ? (
          <>
            <FormSectionIntro
              icon={<Search size={18} />}
              title="Search & social preview"
              description="Overrides are optional. Empty fields use page content first, then official site SEO."
            />
            <FormField
              name="seo_title"
              label={`SEO title · ${formik.values.seo_title.length}/60 recommended`}
              help="Displayed in search results and link previews."
              maxLength={255}
              placeholder={page.title || "Derived from the page title"}
            />
            <FormField
              as="textarea"
              name="seo_description"
              label={`SEO description · ${formik.values.seo_description.length}/160 recommended`}
              help="Summarize this page clearly; longer text is trimmed for metadata."
              maxLength={500}
              rows={4}
              placeholder={page.description || "Derived from page sections and rich text"}
            />
            <div className="form-group">
              <span className="managed-form__label-row">
                <strong>Social image</strong>
                <small>1200 × 630 recommended</small>
              </span>
              <div className="page-manage__image-row">
                <input
                  name="seo_image"
                  value={formik.values.seo_image}
                  onBlur={formik.handleBlur}
                  onChange={event => {
                    void formik.setFieldValue("seo_image", event.target.value);
                    void formik.setFieldValue("imageFile", null);
                    setImagePreview("");
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
                    void formik.setFieldValue("seo_image", "");
                    void formik.setFieldValue("imageFile", null);
                    setImagePreview("");
                    setFileInputKey(value => value + 1);
                  }}
                  disabled={!formik.values.seo_image && !formik.values.imageFile}
                  title="Reset social image"
                  aria-label="Reset social image"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <FormFileInput
                inputKey={fileInputKey}
                label="Upload social image"
                accept="image/jpeg,image/png,image/webp,image/gif"
                file={formik.values.imageFile}
                mediaType="image"
                onSelectUpload={upload => {
                  void formik.setFieldValue("seo_image", upload.url);
                  void formik.setFieldValue("imageFile", null);
                  setImagePreview(upload.url);
                }}
                onChange={file => {
                  void formik.setFieldValue("imageFile", file);
                  setImagePreview(previous => {
                    if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
                    return file ? URL.createObjectURL(file) : "";
                  });
                }}
              />
              <div
                className={`page-manage__image-preview${
                  imagePreview || formik.values.seo_image ? " has-image" : ""
                }`}
              >
                {imagePreview || formik.values.seo_image ? (
                  <img src={imagePreview || formik.values.seo_image} alt="Custom social preview" />
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
                onClick={() => {
                  void formik.setValues({
                    seo_title: "",
                    seo_description: "",
                    seo_image: "",
                    imageFile: null,
                  });
                  setImagePreview("");
                  setFileInputKey(value => value + 1);
                }}
                disabled={
                  !formik.values.seo_title &&
                  !formik.values.seo_description &&
                  !formik.values.seo_image &&
                  !formik.values.imageFile
                }
              >
                <RotateCcw size={14} /> Use automatic SEO
              </button>
            </div>
          </>
        ) : (
          <>
            <FormSectionIntro
              icon={<KeyRound size={18} />}
              title="Ownership & editors"
              description="Control who owns this page and who can edit its content."
            />
            <PageOwnershipPanel
              pageId={page.id}
              owner={owner}
              editors={editors}
              onUpdate={onOwnershipUpdate}
            />
          </>
        )
      }
    </ManagedForm>
  );
}

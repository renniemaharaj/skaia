import { FileText, Paintbrush, Trash2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import { uploader } from "../../atoms/uploadAtom";
import { apiRequest } from "../../utils/api";
import {
  SITE_FONT_PRESETS,
  normalizeSiteFontFamily,
  siteFontPreset,
} from "../../utils/siteFont";
import { FormField, FormFileInput, FormSectionIntro, FormSelect, ManagedForm } from "../form";

interface MetaConfigForm {
  description: string;
  og_image: string;
  dom_skin: string;
  dom_video: string;
  particle_style: string;
  font_family: string;
}

interface MetaValues extends MetaConfigForm {
  fontPreset: string;
  ogImageFile: File | null;
  domSkinFile: File | null;
  domVideoFile: File | null;
}

export default function MetaControlPanel({
  category,
  initialConfig,
  onUpdate,
}: {
  category: "seo" | "visuals";
  initialConfig: MetaConfigForm;
  onUpdate?: (config: MetaConfigForm) => void;
}) {
  const location = useLocation();
  const basePath = location.pathname.startsWith("/form/site") ? "/form/site" : "/admin/meta";

  return (
    <ManagedForm<MetaValues>
      id={`site-${category}-form`}
      title="Site Configuration"
      eyebrow="Site settings"
      description="Manage SEO, visuals, and site-wide metadata."
      initialValues={{
        ...initialConfig,
        fontPreset: siteFontPreset(initialConfig.font_family),
        ogImageFile: null,
        domSkinFile: null,
        domVideoFile: null,
      }}
      enableReinitialize
      cancelTo="/"
      tabsLabel="Site configuration"
      tabs={[
        {
          id: "seo",
          label: "SEO",
          icon: <FileText size={15} />,
          active: category === "seo",
          to: `${basePath}/seo`,
        },
        {
          id: "visuals",
          label: "Visuals",
          icon: <Paintbrush size={15} />,
          active: category === "visuals",
          to: `${basePath}/visuals`,
        },
      ]}
      submitLabel="Save site settings"
      validate={values => ({
        ...(category === "seo" && !values.description.trim()
          ? { description: "Site description is required" }
          : {}),
        ...(values.fontPreset === "custom" && !normalizeSiteFontFamily(values.font_family)
          ? { font_family: "Enter a family using only letters, numbers, spaces, or hyphens." }
          : {}),
      })}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          const og_image = values.ogImageFile
            ? (await uploader.upload(values.ogImageFile, { uploadType: "image" })).url
            : values.og_image;
          const dom_skin = values.domSkinFile
            ? (await uploader.upload(values.domSkinFile, { uploadType: "image" })).url
            : values.dom_skin;
          const dom_video = values.domVideoFile
            ? (await uploader.upload(values.domVideoFile, { uploadType: "video" })).url
            : values.dom_video;
          const font_family = normalizeSiteFontFamily(values.font_family) ?? "";
          const updated = {
            description: values.description,
            og_image,
            dom_skin,
            dom_video,
            particle_style: values.particle_style,
            font_family,
          };
          await apiRequest("/config/seo", {
            method: "PUT",
            body: JSON.stringify(updated),
          });
          onUpdate?.(updated);
        } catch (error) {
          helpers.setStatus(error instanceof Error ? error.message : "Failed to save settings");
        }
      }}
    >
      {formik =>
        category === "seo" ? (
          <>
            <FormSectionIntro
              icon={<FileText size={18} />}
              title="SEO Settings"
              description="Configure metadata for search engines and social media."
            />
            <FormField
              as="textarea"
              name="description"
              label="Description"
              help="Used as the official site fallback description."
              rows={4}
              required
            />
            <MediaFileField
              label="OG image"
              value={formik.values.og_image}
              file={formik.values.ogImageFile}
              accept="image/*"
              mediaType="image"
              onUrlChange={value => void formik.setFieldValue("og_image", value)}
              onFileChange={file => void formik.setFieldValue("ogImageFile", file)}
              onUploadSelect={url => {
                void formik.setFieldValue("og_image", url);
                void formik.setFieldValue("ogImageFile", null);
              }}
              onReset={() => {
                void formik.setFieldValue("og_image", "");
                void formik.setFieldValue("ogImageFile", null);
              }}
            />
          </>
        ) : (
          <>
            <FormSectionIntro
              icon={<Paintbrush size={18} />}
              title="Visual Settings"
              description="Customize the site-wide typography, background, and particle treatment."
            />
            <FormSelect
              name="fontPreset"
              label="Site font"
              block
              options={[
                ...SITE_FONT_PRESETS,
                { value: "custom", label: "Custom Google Font" },
              ]}
              onValueChange={value => {
                if (value !== "custom") {
                  void formik.setFieldValue("font_family", value);
                } else if (SITE_FONT_PRESETS.some(option => option.value === formik.values.font_family)) {
                  void formik.setFieldValue("font_family", "");
                }
              }}
            />
            <p className="form-help">
              Choose a Google Font or enter another Google Fonts family.
            </p>
            {formik.values.fontPreset === "custom" && (
              <FormField
                name="font_family"
                label="Google Font family"
                help="Enter the family name exactly as listed on Google Fonts, for example IBM Plex Sans."
                placeholder="IBM Plex Sans"
                maxLength={64}
                required
              />
            )}
            <FormSelect
              name="particle_style"
              label="Particle style"
              block
              options={[
                { value: "none", label: "None" },
                { value: "default", label: "Default Particles" },
                { value: "gravity", label: "Gravity Particles" },
              ]}
            />
            <MediaFileField
              label="DOM skin background image"
              value={formik.values.dom_skin}
              file={formik.values.domSkinFile}
              accept="image/*"
              mediaType="image"
              onUrlChange={value => void formik.setFieldValue("dom_skin", value)}
              onFileChange={file => void formik.setFieldValue("domSkinFile", file)}
              onUploadSelect={url => {
                void formik.setFieldValue("dom_skin", url);
                void formik.setFieldValue("domSkinFile", null);
              }}
              onReset={() => {
                void formik.setFieldValue("dom_skin", "");
                void formik.setFieldValue("domSkinFile", null);
              }}
            />
            <MediaFileField
              label="DOM skin background video"
              value={formik.values.dom_video}
              file={formik.values.domVideoFile}
              accept="video/mp4,video/webm"
              mediaType="video"
              onUrlChange={value => void formik.setFieldValue("dom_video", value)}
              onFileChange={file => void formik.setFieldValue("domVideoFile", file)}
              onUploadSelect={url => {
                void formik.setFieldValue("dom_video", url);
                void formik.setFieldValue("domVideoFile", null);
              }}
              onReset={() => {
                void formik.setFieldValue("dom_video", "");
                void formik.setFieldValue("domVideoFile", null);
              }}
            />
          </>
        )
      }
    </ManagedForm>
  );
}

function MediaFileField({
  label,
  value,
  file,
  accept,
  mediaType,
  onUrlChange,
  onFileChange,
  onUploadSelect,
  onReset,
}: {
  label: string;
  value: string;
  file: File | null;
  accept: string;
  mediaType: "image" | "video";
  onUrlChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onUploadSelect: (url: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="managed-form__media-row">
        <input
          value={value}
          onChange={event => onUrlChange(event.target.value)}
          placeholder="URL or upload below"
          aria-label={`${label} URL`}
        />
        <button
          type="button"
          className="action-btn danger"
          onClick={onReset}
          aria-label={`Reset ${label}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <FormFileInput
        label={`Upload ${label}`}
        accept={accept}
        file={file}
        mediaType={mediaType}
        onChange={onFileChange}
        onSelectUpload={upload => onUploadSelect(upload.url)}
      />
    </div>
  );
}

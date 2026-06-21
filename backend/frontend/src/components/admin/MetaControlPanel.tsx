import { Trash2, Settings } from "lucide-react";
import { useState } from "react";
import { uploader } from "../../atoms/uploadAtom";
import { apiRequest } from "../../utils/api";
import Button from "../input/Button";
import Select from "../input/Select";

interface MetaConfigForm {
  description: string;
  og_image: string;
  dom_skin: string;
  dom_video: string;
  particle_style: string;
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
  const [form, setForm] = useState<MetaConfigForm>(initialConfig);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [domSkinFile, setDomSkinFile] = useState<File | null>(null);
  const [domVideoFile, setDomVideoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (e.target.name === "og_image_file") {
      setOgImageFile(file);
    } else if (e.target.name === "dom_skin_file") {
      setDomSkinFile(file);
    } else if (e.target.name === "dom_video_file") {
      setDomVideoFile(file);
    }
  };

  const handleReset = (field: keyof MetaConfigForm) => {
    setForm({ ...form, [field]: "" });
    if (field === "og_image") setOgImageFile(null);
    if (field === "dom_skin") setDomSkinFile(null);
    if (field === "dom_video") setDomVideoFile(null);
  };

  async function uploadFile(file: File, type: "image" | "video" = "image"): Promise<string> {
    const res = await uploader.upload(file, { uploadType: type });
    return res.url;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let og_image = form.og_image;
      if (ogImageFile) og_image = await uploadFile(ogImageFile, "image");
      let dom_skin = form.dom_skin;
      if (domSkinFile) dom_skin = await uploadFile(domSkinFile, "image");
      let dom_video = form.dom_video;
      if (domVideoFile) dom_video = await uploadFile(domVideoFile, "video");
      await apiRequest("/config/seo", {
        method: "PUT",
        body: JSON.stringify({
          description: form.description,
          og_image,
          dom_skin,
          dom_video,
          particle_style: form.particle_style,
        }),
      });
      onUpdate?.({ ...form, og_image, dom_skin, dom_video, particle_style: form.particle_style });
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="modal-form compact-form-card"
    >
      <div className="section__header">
        <Settings className="section__header-icon" size={24} />
        <span className="section__header-eyebrow">
          {category === "seo" ? "Configuration" : "Customization"}
        </span>
        <h3 style={{ margin: 0 }}>
          {category === "seo" ? "SEO Settings" : "Visual Settings"}
        </h3>
        <p>
          {category === "seo"
            ? "Configure metadata for search engines and social media."
            : "Customize the appearance of this page."}
        </p>
      </div>

      {category === "seo" && (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="meta-description">Description</label>
            <textarea
              id="meta-description"
              name="description"
              className="form-input"
              value={form.description}
              onChange={handleInput}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="meta-og-image">OG Image</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                id="meta-og-image"
                name="og_image"
                className="form-input"
                value={form.og_image}
                onChange={handleInput}
                placeholder="Image URL or upload below"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="action-btn danger"
                onClick={() => handleReset("og_image")}
                title="Reset OG Image"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              type="file"
              name="og_image_file"
              accept="image/*"
              onChange={handleFile}
              style={{ marginTop: "0.5rem" }}
            />
          </div>
        </>
      )}

      {category === "visuals" && (
        <>
          <div className="form-group">
            <Select
              label="Particle Style"
              name="particle_style"
              value={form.particle_style || "none"}
              onChange={handleInput}
              options={[
                { value: "none", label: "None" },
                { value: "default", label: "Default Particles" },
                { value: "gravity", label: "Gravity Particles" },
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="meta-dom-skin">
              DOM Skin Background Image
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                id="meta-dom-skin"
                name="dom_skin"
                className="form-input"
                value={form.dom_skin}
                onChange={handleInput}
                placeholder="Image URL or upload below (e.g. Minecraft texture)"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="action-btn danger"
                onClick={() => handleReset("dom_skin")}
                title="Reset Background Image"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              type="file"
              name="dom_skin_file"
              accept="image/*"
              onChange={handleFile}
              style={{ marginTop: "0.5rem" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="meta-dom-video">
              DOM Skin Background Video
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                id="meta-dom-video"
                name="dom_video"
                className="form-input"
                value={form.dom_video}
                onChange={handleInput}
                placeholder="Video URL or upload below (e.g. mp4)"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="action-btn danger"
                onClick={() => handleReset("dom_video")}
                title="Reset Background Video"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              type="file"
              name="dom_video_file"
              accept="video/mp4,video/webm"
              onChange={handleFile}
              style={{ marginTop: "0.5rem" }}
            />
          </div>
        </>
      )}

      {error && <div style={{ color: "var(--error-color)", fontWeight: 600 }}>{error}</div>}
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={saving}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

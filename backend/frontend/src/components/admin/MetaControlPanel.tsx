import { useState } from "react";
import { apiRequest } from "../../utils/api";
import { Trash2 } from "lucide-react";
import "./MetaControlPanel.css";

interface MetaConfigForm {
  description: string;
  og_image: string;
  dom_skin: string;
  dom_video: string;
}

export default function MetaControlPanel({
  initialConfig,
  onUpdate,
}: {
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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
    const formData = new FormData();
    formData.append("file", file);
    const endpoint = `/upload/${type}`;
    const res = await apiRequest<{ url: string }>(endpoint, {
      method: "POST",
      body: formData,
    });
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
        }),
      });
      onUpdate?.({ ...form, og_image, dom_skin, dom_video });
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="meta-control-panel" onSubmit={handleSubmit}>
      <h2>Site Meta Settings</h2>
      <label>
        Description
        <textarea
          name="description"
          value={form.description}
          onChange={handleInput}
          required
        />
      </label>
      <div className="meta-field-group">
        <label>
          OG Image
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              name="og_image"
              value={form.og_image}
              onChange={handleInput}
              placeholder="Image URL or upload below"
              style={{ flex: 1 }}
            />
            <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => handleReset("og_image")} title="Reset OG Image">
              <Trash2 size={14} />
            </button>
          </div>
          <input type="file" name="og_image_file" accept="image/*" onChange={handleFile} />
        </label>
      </div>
      <div className="meta-field-group">
        <label>
          DOM Skin Background Image
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              name="dom_skin"
              value={form.dom_skin}
              onChange={handleInput}
              placeholder="Image URL or upload below (e.g. Minecraft texture)"
              style={{ flex: 1 }}
            />
            <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => handleReset("dom_skin")} title="Reset Background Image">
              <Trash2 size={14} />
            </button>
          </div>
          <input type="file" name="dom_skin_file" accept="image/*" onChange={handleFile} />
        </label>
      </div>
      <div className="meta-field-group">
        <label>
          DOM Skin Background Video
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              name="dom_video"
              value={form.dom_video}
              onChange={handleInput}
              placeholder="Video URL or upload below (e.g. mp4)"
              style={{ flex: 1 }}
            />
            <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => handleReset("dom_video")} title="Reset Background Video">
              <Trash2 size={14} />
            </button>
          </div>
          <input type="file" name="dom_video_file" accept="video/mp4,video/webm" onChange={handleFile} />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

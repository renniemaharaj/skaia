import { useState } from "react";
import { apiRequest } from "../../utils/api";
import { Trash2 } from "lucide-react";
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
        {category === "seo" ? "SEO Settings" : "Visual Settings"}
      </h2>
      
      {category === "seo" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontWeight: 600, color: "var(--text-primary)" }}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleInput}
              required
              style={{
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                background: "var(--bg-color)",
                color: "var(--text-primary)",
                minHeight: "100px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontWeight: 600, color: "var(--text-primary)" }}>OG Image</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                name="og_image"
                value={form.og_image}
                onChange={handleInput}
                placeholder="Image URL or upload below"
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  background: "var(--bg-color)",
                  color: "var(--text-primary)",
                }}
              />
              <Button variant="danger" size="icon" onClick={(e: any) => { e.preventDefault(); handleReset("og_image"); }} title="Reset OG Image">
                <Trash2 size={14} />
              </Button>
            </div>
            <input type="file" name="og_image_file" accept="image/*" onChange={handleFile} style={{ marginTop: "0.5rem" }} />
          </div>
        </>
      )}

      {category === "visuals" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontWeight: 600, color: "var(--text-primary)" }}>DOM Skin Background Image</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                name="dom_skin"
                value={form.dom_skin}
                onChange={handleInput}
                placeholder="Image URL or upload below (e.g. Minecraft texture)"
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  background: "var(--bg-color)",
                  color: "var(--text-primary)",
                }}
              />
              <Button variant="danger" size="icon" onClick={(e: any) => { e.preventDefault(); handleReset("dom_skin"); }} title="Reset Background Image">
                <Trash2 size={14} />
              </Button>
            </div>
            <input type="file" name="dom_skin_file" accept="image/*" onChange={handleFile} style={{ marginTop: "0.5rem" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontWeight: 600, color: "var(--text-primary)" }}>DOM Skin Background Video</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                name="dom_video"
                value={form.dom_video}
                onChange={handleInput}
                placeholder="Video URL or upload below (e.g. mp4)"
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  background: "var(--bg-color)",
                  color: "var(--text-primary)",
                }}
              />
              <Button variant="danger" size="icon" onClick={(e: any) => { e.preventDefault(); handleReset("dom_video"); }} title="Reset Background Video">
                <Trash2 size={14} />
              </Button>
            </div>
            <input type="file" name="dom_video_file" accept="video/mp4,video/webm" onChange={handleFile} style={{ marginTop: "0.5rem" }} />
          </div>
        </>
      )}

      {error && <div style={{ color: "var(--error-color)", fontWeight: 600 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        <Button type="submit" variant="primary" loading={saving}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

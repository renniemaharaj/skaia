import { useState } from "react";
import { apiRequest } from "../../utils/api";
import "./MetaControlPanel.css";

interface MetaConfigForm {
  description: string;
  og_image: string;
  dom_skin: string;
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
    }
  };

  async function uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const endpoint = "/upload/image";
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
      if (ogImageFile) og_image = await uploadFile(ogImageFile);
      let dom_skin = form.dom_skin;
      if (domSkinFile) dom_skin = await uploadFile(domSkinFile);
      await apiRequest("/config/seo", {
        method: "PUT",
        body: JSON.stringify({
          description: form.description,
          og_image,
          dom_skin,
        }),
      });
      onUpdate?.({ ...form, og_image, dom_skin });
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
      <label>
        OG Image
        <input
          type="text"
          name="og_image"
          value={form.og_image}
          onChange={handleInput}
          placeholder="Image URL or upload below"
        />
        <input type="file" name="og_image_file" accept="image/*" onChange={handleFile} />
      </label>
      <label>
        DOM Skin Background Image
        <input
          type="text"
          name="dom_skin"
          value={form.dom_skin}
          onChange={handleInput}
          placeholder="Image URL or upload below (e.g. Minecraft texture)"
        />
        <input type="file" name="dom_skin_file" accept="image/*" onChange={handleFile} />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

import { useState } from "react";
import { apiRequest } from "../../utils/api";
import "./MetaControlPanel.css";

interface MetaConfigForm {
  title: string;
  description: string;
  og_image: string;
  favicon_url: string;
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
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "og" | "favicon",
  ) => {
    const file = e.target.files?.[0] || null;
    if (type === "og") setOgImageFile(file);
    else setFaviconFile(file);
  };

  async function uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    // backend provides a generic image upload endpoint: /upload/image
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
      let favicon_url = form.favicon_url;
      if (ogImageFile) og_image = await uploadFile(ogImageFile);
      if (faviconFile) favicon_url = await uploadFile(faviconFile);
      await apiRequest("/config/seo", {
        method: "PUT",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          og_image,
        }),
      });
      await apiRequest("/config/branding", {
        method: "PUT",
        body: JSON.stringify({ favicon_url }),
      });
      onUpdate?.({ ...form, og_image, favicon_url });
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
        Title
        <input
          name="title"
          value={form.title}
          onChange={handleInput}
          required
        />
      </label>
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
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(e, "og")}
        />
      </label>
      <label>
        Favicon
        <input
          type="text"
          name="favicon_url"
          value={form.favicon_url}
          onChange={handleInput}
          placeholder="Favicon URL or upload below"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(e, "favicon")}
        />
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

import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Documentation } from "../../atoms/documentation";
import { apiRequest } from "../../utils/api";
import "../../components/documentation/DocumentationShell.css";

export default function NewDocumentationPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await apiRequest<Documentation>("/docs/", {
        method: "POST",
        body: JSON.stringify({ title, slug, description, visibility: "public" }),
      });
      toast.success("Documentation created");
      navigate(`/doc/${created.slug}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create documentation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="documentation-form-page">
      <header className="documentation-form-page__header">
        <div><p className="documentation-eyebrow">Documentation</p><h1>Create documentation</h1><p>Start a separate collection of guides for this site.</p></div>
        <Link className="action-btn" to="/doc" title="Cancel"><X size={20} /></Link>
      </header>
      <form className="documentation-panel documentation-route-form" onSubmit={create}>
        <label className="documentation-field"><span>Display name</span><input autoFocus required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} placeholder="Platform documentation" /></label>
        <label className="documentation-field"><span>URL slug</span><input required maxLength={120} value={slug} onChange={event => setSlug(event.target.value)} placeholder="platform" /><small>Published at /doc/{slug || "platform"}</small></label>
        <label className="documentation-field documentation-field--wide"><span>Description <small>Optional</small></span><textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="What will readers learn here?" /></label>
        <div className="documentation-form-actions documentation-field--wide">
          <button className="btn btn-primary" type="submit" disabled={saving}><Plus size={16} />{saving ? "Creating..." : "Create documentation"}</button>
          <Link className="btn btn-ghost" to="/doc">Cancel</Link>
        </div>
      </form>
    </main>
  );
}

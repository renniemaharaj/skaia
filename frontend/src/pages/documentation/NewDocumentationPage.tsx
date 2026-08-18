import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Documentation } from "../../atoms/documentation";
import FormHeaderActions from "../../components/ui/FormHeaderActions";
import { apiRequest } from "../../utils/api";
import "../../components/forum/NewThread.css";
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
    <main className="modal">
      <header className="modal-header">
        <div className="modal-title-wrapper">
          <h2>Create Documentation</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Start a separate collection of guides for this site.
          </p>
        </div>
        <FormHeaderActions
          formId="new-documentation-form"
          onCancel={() => navigate("/doc")}
          confirmDisabled={!title.trim() || !slug.trim()}
          saving={saving}
          confirmLabel="Create"
        />
      </header>

      <form id="new-documentation-form" className="modal-form compact-form-card" onSubmit={create}>
        <div className="form-group">
          <label className="form-label" htmlFor="documentation-title">
            Display name *
          </label>
          <input
            id="documentation-title"
            className="form-input"
            autoFocus
            required
            maxLength={255}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Platform documentation"
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="documentation-slug">
            URL slug *
          </label>
          <p className="form-help">Published at /doc/{slug || "platform"}</p>
          <input
            id="documentation-slug"
            className="form-input"
            required
            maxLength={120}
            value={slug}
            onChange={event => setSlug(event.target.value)}
            placeholder="platform"
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="documentation-description">
            Description
          </label>
          <textarea
            id="documentation-description"
            className="form-input"
            rows={4}
            maxLength={2000}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="What will readers learn here?"
            disabled={saving}
          />
        </div>
      </form>
    </main>
  );
}

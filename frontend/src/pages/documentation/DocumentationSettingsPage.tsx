import { ChevronDown, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { DocumentationManifest } from "../../atoms/documentation";
import { confirmDestructiveAction } from "../../components/ui/Prompt";
import { apiRequest } from "../../utils/api";
import "../../components/documentation/DocumentationShell.css";

export default function DocumentationSettingsPage() {
  const { documentationSlug = "" } = useParams<{ documentationSlug: string }>();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<DocumentationManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionTitles, setSectionTitles] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState({ title: "", slug: "", description: "", visibility: "public" });

  const load = useCallback(async () => {
    try {
      const next = await apiRequest<DocumentationManifest>(`/docs/${encodeURIComponent(documentationSlug)}`);
      if (!next.documentation.can_edit) {
        toast.error("You cannot manage this documentation");
        navigate(`/doc/${documentationSlug}`, { replace: true });
        return;
      }
      setManifest(next);
      setDraft({ title: next.documentation.title, slug: next.documentation.slug, description: next.documentation.description, visibility: next.documentation.visibility });
      setSectionTitles(Object.fromEntries(next.sections.map(section => [section.id, section.title])));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to load documentation settings");
    } finally {
      setLoading(false);
    }
  }, [documentationSlug, navigate]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!manifest) return;
    setSaving(true);
    try {
      const updated = await apiRequest<DocumentationManifest["documentation"]>(`/docs/id/${manifest.documentation.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...draft, revision: manifest.documentation.revision }),
      });
      toast.success("Documentation updated");
      navigate(`/doc/${updated.slug}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update documentation");
    } finally {
      setSaving(false);
    }
  };

  const addSection = async (event: FormEvent) => {
    event.preventDefault();
    if (!manifest) return;
    try {
      await apiRequest(`/docs/id/${manifest.documentation.id}/sections`, { method: "POST", body: JSON.stringify({ title: sectionTitle }) });
      setSectionTitle("");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to create section"); }
  };

  const updateSection = async (sectionId: number) => {
    try {
      await apiRequest(`/docs/sections/${sectionId}`, { method: "PUT", body: JSON.stringify({ title: sectionTitles[sectionId] }) });
      toast.success("Section updated");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to update section"); }
  };

  const removeSection = async (sectionId: number) => {
    if (!(await confirmDestructiveAction({ title: "Delete this section?", body: "Its guides will move to the Overview group.", confirmLabel: "Delete section" }))) return;
    try { await apiRequest(`/docs/sections/${sectionId}`, { method: "DELETE" }); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to delete section"); }
  };

  const moveSection = async (sectionId: number, direction: -1 | 1) => {
    if (!manifest) return;
    const sections = [...manifest.sections];
    const index = sections.findIndex(section => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    try {
      await apiRequest(`/docs/id/${manifest.documentation.id}/navigation`, { method: "PUT", body: JSON.stringify({ sections: sections.map((item, position) => ({ id: item.id, display_order: position })), articles: manifest.articles.map((item, position) => ({ id: item.id, display_order: position })) }) });
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to reorder sections"); }
  };

  const removeDocumentation = async () => {
    if (!manifest || !(await confirmDestructiveAction({ title: "Delete this documentation set?", body: "The collection and its guides will move to Trash.", confirmLabel: "Delete documentation" }))) return;
    try { await apiRequest(`/docs/id/${manifest.documentation.id}`, { method: "DELETE" }); toast.success("Documentation moved to Trash"); navigate("/doc"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to delete documentation"); }
  };

  if (loading) return <div className="card">Loading documentation settings...</div>;
  if (!manifest) return <div className="card" role="alert">Documentation settings are unavailable.</div>;

  return (
    <main className="documentation-form-page">
      <header className="documentation-form-page__header">
        <div><p className="documentation-eyebrow">{manifest.documentation.title}</p><h1>Documentation settings</h1><p>Manage collection details, visibility, and sidebar sections.</p></div>
        <Link className="action-btn" to={`/doc/${manifest.documentation.slug}`} title="Close settings"><X size={20} /></Link>
      </header>
      <form className="documentation-panel documentation-route-form" onSubmit={save}>
        <label className="documentation-field"><span>Display name</span><input autoFocus required maxLength={255} placeholder="Platform documentation" value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></label>
        <label className="documentation-field"><span>URL slug</span><input required maxLength={120} placeholder="platform" value={draft.slug} onChange={event => setDraft(value => ({ ...value, slug: event.target.value }))} /><small>/doc/{draft.slug || "platform"}</small></label>
        <label className="documentation-field documentation-field--wide"><span>Description</span><textarea maxLength={2000} placeholder="What will readers find here?" value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} /></label>
        <label className="documentation-field documentation-field--wide"><span>Visibility</span><select value={draft.visibility} onChange={event => setDraft(value => ({ ...value, visibility: event.target.value }))}><option value="public">Public - listed and searchable</option><option value="unlisted">Unlisted - available by direct link</option><option value="private">Private - editors only</option></select></label>
        <div className="documentation-form-actions documentation-field--wide"><button className="btn btn-primary" disabled={saving}><Save size={15} />{saving ? "Saving..." : "Save settings"}</button><Link className="btn btn-ghost" to={`/doc/${manifest.documentation.slug}`}>Cancel</Link></div>
      </form>

      <section className="documentation-panel documentation-sections-panel">
        <div className="documentation-panel__heading"><div><p className="documentation-eyebrow">Navigation</p><h2>Sidebar sections</h2></div><p>Create and order the groups readers use to browse guides.</p></div>
        <form className="documentation-add-section" onSubmit={addSection}><label className="documentation-field"><span>New section name</span><input required maxLength={255} placeholder="Getting started" value={sectionTitle} onChange={event => setSectionTitle(event.target.value)} /></label><button className="btn btn-ghost"><Plus size={15} />Add section</button></form>
        <div className="documentation-section-list">
          {manifest.sections.map((section, index) => (
            <div className="documentation-section-row" key={section.id}>
              <input aria-label={`Rename ${section.title}`} value={sectionTitles[section.id] ?? section.title} onChange={event => setSectionTitles(value => ({ ...value, [section.id]: event.target.value }))} />
              <button className="action-btn" type="button" title="Save section title" onClick={() => void updateSection(section.id)}><Save size={14} /></button>
              <button className="action-btn" type="button" title="Move section up" disabled={index === 0} onClick={() => void moveSection(section.id, -1)}><ChevronUp size={14} /></button>
              <button className="action-btn" type="button" title="Move section down" disabled={index === manifest.sections.length - 1} onClick={() => void moveSection(section.id, 1)}><ChevronDown size={14} /></button>
              <button className="action-btn danger" type="button" title="Delete section" onClick={() => void removeSection(section.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          {!manifest.sections.length && <p className="documentation-muted">No sidebar sections yet. Guides can still appear under Overview.</p>}
        </div>
      </section>

      <section className="documentation-danger-zone"><div><h2>Delete documentation</h2><p>Move this collection and all of its guides to Trash.</p></div><button className="btn btn-danger" type="button" onClick={() => void removeDocumentation()}><Trash2 size={15} />Delete documentation</button></section>
    </main>
  );
}

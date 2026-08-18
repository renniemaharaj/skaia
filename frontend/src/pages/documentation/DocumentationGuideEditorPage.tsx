import { Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  DocumentationArticle,
  DocumentationArticleView,
  DocumentationManifest,
} from "../../atoms/documentation";
import FormHeaderActions from "../../components/ui/FormHeaderActions";
import { confirmDestructiveAction } from "../../components/ui/Prompt";
import RichTextEditor from "../../components/ui/RichTextEditor";
import { useDirtyNavigationGuard } from "../../hooks/useDirtyNavigationGuard";
import { apiRequest } from "../../utils/api";
import "../../components/documentation/DocumentationShell.css";
import "../../components/forum/NewThread.css";
import "../../components/forum/IconButton.css";

interface GuideDraft {
  title: string;
  slug: string;
  summary: string;
  content: string;
  sectionId: number | null;
}

export default function DocumentationGuideEditorPage() {
  const { documentationSlug = "", articleSlug } = useParams<{
    documentationSlug: string;
    articleSlug?: string;
  }>();
  const navigate = useNavigate();
  const editing = Boolean(articleSlug);
  const [manifest, setManifest] = useState<DocumentationManifest | null>(null);
  const [article, setArticle] = useState<DocumentationArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<GuideDraft>({
    title: "",
    slug: "",
    summary: "",
    content: "<p>Start writing this guide.</p>",
    sectionId: null,
  });
  useDirtyNavigationGuard(dirty, {
    title: "Discard unsaved guide changes?",
    body: "Your edits have not been saved. Leave this page and discard them?",
  });

  const load = useCallback(async () => {
    try {
      const nextManifest = await apiRequest<DocumentationManifest>(
        `/docs/${encodeURIComponent(documentationSlug)}`
      );
      if (!nextManifest.documentation.can_edit) {
        toast.error("You cannot edit this documentation");
        navigate(`/doc/${documentationSlug}`, { replace: true });
        return;
      }
      setManifest(nextManifest);
      if (articleSlug) {
        const response = await apiRequest<DocumentationArticleView>(
          `/docs/${encodeURIComponent(documentationSlug)}/articles/${encodeURIComponent(articleSlug)}`
        );
        setArticle(response.article);
        setDraft({
          title: response.article.title,
          slug: response.article.slug,
          summary: response.article.summary,
          content: response.article.content ?? "",
          sectionId: response.article.section_id ?? null,
        });
      }
      setDirty(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to load guide editor");
    } finally {
      setLoading(false);
    }
  }, [articleSlug, documentationSlug, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (next: Partial<GuideDraft>) => {
    setDraft(value => ({ ...value, ...next }));
    setDirty(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!manifest) return;
    setError(null);
    setSaving(true);
    try {
      const endpoint =
        editing && article
          ? `/docs/articles/${article.id}`
          : `/docs/id/${manifest.documentation.id}/articles`;
      const updated = await apiRequest<DocumentationArticle>(endpoint, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          section_id: draft.sectionId,
          slug: draft.slug,
          title: draft.title,
          summary: draft.summary,
          content: draft.content,
          ...(editing && article ? { revision: article.revision } : {}),
        }),
      });
      setDirty(false);
      toast.success(editing ? "Guide updated" : "Guide created");
      navigate(`/doc/${manifest.documentation.slug}/${updated.slug}`);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : `Unable to ${editing ? "update" : "create"} guide`;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !article ||
      !(await confirmDestructiveAction({
        title: "Delete this guide?",
        body: "The guide will move to Trash.",
        confirmLabel: "Delete guide",
      }))
    )
      return;
    try {
      await apiRequest(`/docs/articles/${article.id}`, { method: "DELETE" });
      setDirty(false);
      toast.success("Guide moved to Trash");
      navigate(`/doc/${documentationSlug}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to delete guide");
    }
  };

  if (loading) return <div className="card">Loading guide editor...</div>;
  if (!manifest || (editing && !article))
    return (
      <div className="card" role="alert">
        Guide editor is unavailable.
      </div>
    );
  const returnTo = article
    ? `/doc/${manifest.documentation.slug}/${article.slug}`
    : `/doc/${manifest.documentation.slug}`;

  return (
    <main className="modal documentation-guide-modal">
      <header className="modal-header">
        <div className="modal-title-wrapper">
          <h2>{editing ? "Edit Guide" : "Create New Guide"}</h2>
          <p className="documentation-guide-modal__subtitle">
            {editing
              ? `Update this guide in ${manifest.documentation.title}`
              : `Add a guide to ${manifest.documentation.title}`}
          </p>
        </div>
        <FormHeaderActions
          formId="documentation-guide-form"
          cancelTo={returnTo}
          confirmDisabled={!draft.title.trim() || !draft.slug.trim()}
          saving={saving}
          confirmLabel={editing ? "Save guide" : "Create guide"}
        />
      </header>
      <form
        id="documentation-guide-form"
        className="modal-form compact-form-card documentation-guide-editor"
        onSubmit={save}
      >
        {error && (
          <div className="documentation-form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-group">
          <label htmlFor="documentation-guide-title">Guide display name</label>
          <p className="form-help">Use a clear title that tells readers what this guide covers.</p>
          <input
            id="documentation-guide-title"
            autoFocus
            required
            maxLength={255}
            placeholder="Install the platform"
            value={draft.title}
            onChange={event => updateDraft({ title: event.target.value })}
            disabled={saving}
          />
        </div>
        <div className="form-group">
          <label htmlFor="documentation-guide-slug">Guide URL slug</label>
          <p className="form-help">
            Published at /doc/{manifest.documentation.slug}/{draft.slug || "guide"}
          </p>
          <input
            id="documentation-guide-slug"
            required
            maxLength={120}
            placeholder="install-platform"
            value={draft.slug}
            onChange={event => updateDraft({ slug: event.target.value })}
            disabled={saving}
          />
        </div>
        <div className="form-group">
          <label htmlFor="documentation-guide-summary">Guide summary</label>
          <p className="form-help">Optional introduction displayed below the guide title.</p>
          <textarea
            id="documentation-guide-summary"
            maxLength={2000}
            placeholder="Help readers understand what they will learn."
            value={draft.summary}
            onChange={event => updateDraft({ summary: event.target.value })}
            disabled={saving}
          />
        </div>
        <div className="form-group">
          <label htmlFor="documentation-guide-section">Sidebar section</label>
          <p className="form-help">
            Choose where this guide appears in the documentation navigation.
          </p>
          <select
            id="documentation-guide-section"
            value={draft.sectionId ?? ""}
            onChange={event =>
              updateDraft({
                sectionId: event.target.value ? Number(event.target.value) : null,
              })
            }
            disabled={saving}
          >
            <option value="">Overview</option>
            {manifest.sections.map(section => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group documentation-guide-editor__content">
          <label>Guide content</label>
          <p className="form-help">Write and format the complete guide for readers.</p>
          <RichTextEditor
            value={draft.content}
            onChange={content => updateDraft({ content })}
            minHeight="420px"
          />
        </div>
        {editing && (
          <div className="documentation-guide-editor__danger">
            <div>
              <strong>Delete guide</strong>
              <p>Move this guide to Trash.</p>
            </div>
            <button
              className="btn btn-danger"
              type="button"
              disabled={saving}
              onClick={() => void remove()}
            >
              <Trash2 size={15} />
              Delete guide
            </button>
          </div>
        )}
      </form>
    </main>
  );
}

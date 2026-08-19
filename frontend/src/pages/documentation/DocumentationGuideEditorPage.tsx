import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  DocumentationArticle,
  DocumentationArticleView,
  DocumentationManifest,
} from "../../atoms/documentation";
import { FormField, FormSelect, ManagedForm } from "../../components/form";
import { confirmDestructiveAction } from "../../components/ui/Prompt";
import RichTextEditor from "../../components/ui/RichTextEditor";
import { useDirtyNavigationGuard } from "../../hooks/useDirtyNavigationGuard";
import { apiRequest } from "../../utils/api";
import "../../components/documentation/DocumentationShell.css";
import "../../components/forum/IconButton.css";

interface GuideDraft {
  title: string;
  slug: string;
  summary: string;
  content: string;
  sectionId: string;
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
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<GuideDraft>({
    title: "",
    slug: "",
    summary: "",
    content: "<p>Start writing this guide.</p>",
    sectionId: "",
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
          sectionId: response.article.section_id ? String(response.article.section_id) : "",
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

  const save = async (values: GuideDraft, helpers: { setStatus: (status?: string) => void }) => {
    if (!manifest) return;
    helpers.setStatus(undefined);
    try {
      const endpoint =
        editing && article
          ? `/docs/articles/${article.id}`
          : `/docs/id/${manifest.documentation.id}/articles`;
      const updated = await apiRequest<DocumentationArticle>(endpoint, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          section_id: values.sectionId ? Number(values.sectionId) : null,
          slug: values.slug,
          title: values.title,
          summary: values.summary,
          content: values.content,
          ...(editing && article ? { revision: article.revision } : {}),
        }),
      });
      setDirty(false);
      toast.success(editing ? "Guide updated" : "Guide created");
      navigate(`/doc/${manifest.documentation.slug}/${updated.slug}`);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : `Unable to ${editing ? "update" : "create"} guide`;
      helpers.setStatus(message);
      toast.error(message);
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
    <ManagedForm<GuideDraft>
      id="documentation-guide-form"
      title={editing ? "Edit Guide" : "Create New Guide"}
      eyebrow="Documentation"
      description={
        editing
          ? `Update this guide in ${manifest.documentation.title}`
          : `Add a guide to ${manifest.documentation.title}`
      }
      initialValues={draft}
      enableReinitialize
      cancelTo={returnTo}
      submitLabel={editing ? "Save guide" : "Create guide"}
      submitDisabled={formik => !formik.values.title.trim() || !formik.values.slug.trim()}
      formClassName="documentation-guide-editor"
      className="documentation-guide-modal"
      validate={values => ({
        ...(!values.title.trim() ? { title: "Guide display name is required" } : {}),
        ...(!values.slug.trim() ? { slug: "Guide URL slug is required" } : {}),
      })}
      onSubmit={save}
    >
      {formik => (
        <>
          <FormField
            name="title"
            label="Guide display name"
            help="Use a clear title that tells readers what this guide covers."
            placeholder="Install the platform"
            maxLength={255}
            autoFocus
            required
            onChange={event => {
              setDirty(true);
              void formik.setFieldValue("title", event.target.value);
            }}
          />
          <FormField
            name="slug"
            label="Guide URL slug"
            help={`Published at /doc/${manifest.documentation.slug}/${formik.values.slug || "guide"}`}
            placeholder="install-platform"
            maxLength={120}
            required
            onChange={event => {
              setDirty(true);
              void formik.setFieldValue("slug", event.target.value);
            }}
          />
          <FormField
            as="textarea"
            name="summary"
            label="Guide summary"
            help="Optional introduction displayed below the guide title."
            placeholder="Help readers understand what they will learn."
            maxLength={2000}
            onChange={event => {
              setDirty(true);
              void formik.setFieldValue("summary", event.target.value);
            }}
          />
          <FormSelect
            name="sectionId"
            label="Sidebar section"
            block
            options={[
              { value: "", label: "Overview" },
              ...manifest.sections.map(section => ({
                value: String(section.id),
                label: section.title,
              })),
            ]}
            onValueChange={() => setDirty(true)}
          />
          <div className="form-group documentation-guide-editor__content">
            <label>Guide content</label>
            <p className="form-help">Write and format the complete guide for readers.</p>
            <RichTextEditor
              value={formik.values.content}
              onChange={content => {
                setDirty(true);
                void formik.setFieldValue("content", content);
              }}
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
                disabled={formik.isSubmitting}
                onClick={() => void remove()}
              >
                <Trash2 size={15} />
                Delete guide
              </button>
            </div>
          )}
        </>
      )}
    </ManagedForm>
  );
}

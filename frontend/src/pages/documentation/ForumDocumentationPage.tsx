import { useSetAtom } from "jotai";
import { Copy, Edit3, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { ForumDocumentationManifest } from "../../atoms/documentation";
import { type ForumThread, currentThreadAtom } from "../../atoms/forum";
import {
  DocumentationShell,
  type DocumentationNavSection,
} from "../../components/documentation/DocumentationShell";
import { indexDocumentHeadings } from "../../components/documentation/headings";
import ViewThreadComments from "../../components/forum/ViewThreadComments";
import { RichTextRenderer } from "../../components/ui/RichTextRenderer";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

export default function ForumDocumentationPage() {
  const { categoryId, threadId } = useParams<{ categoryId?: string; threadId?: string }>();
  const navigate = useNavigate();
  const setCurrentThread = useSetAtom(currentThreadAtom);
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [manifest, setManifest] = useState<ForumDocumentationManifest | null>(null);
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadManifest = useCallback(async (query = "") => {
    const suffix = query.trim().length >= 2 ? `?q=${encodeURIComponent(query)}` : "";
    const response = await apiRequest<ForumDocumentationManifest>(`/forum/documentation${suffix}`);
    setManifest(response);
    return response;
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const nextManifest = await loadManifest();
      if (!categoryId) {
        const first = nextManifest.articles[0];
        if (first) navigate(`/forum/docs/${first.category_id}/${first.id}`, { replace: true });
        return;
      }
      if (!threadId) {
        const first = nextManifest.articles.find(
          article => String(article.category_id) === categoryId
        );
        if (first) navigate(`/forum/docs/${categoryId}/${first.id}`, { replace: true });
        return;
      }
      const loadedThread = await apiRequest<ForumThread>(`/forum/threads/${threadId}`);
      setThread(loadedThread);
      setCurrentThread(loadedThread);
      if (String(loadedThread.category_id) !== categoryId) {
        navigate(`/forum/docs/${loadedThread.category_id}/${loadedThread.id}`, { replace: true });
      }
      subscribe("thread", loadedThread.id);
      subscribe("forum_category", loadedThread.category_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load forum documentation");
    } finally {
      setLoading(false);
    }
  }, [categoryId, loadManifest, navigate, setCurrentThread, subscribe, threadId]);

  useEffect(() => {
    setLoading(true);
    void load();
    return () => {
      if (thread?.id) unsubscribe("thread", thread.id);
      if (thread?.category_id) unsubscribe("forum_category", thread.category_id);
    };
  }, [load]);

  useEffect(() => {
    if (search.trim().length < 2) {
      if (manifest && search === "") void loadManifest();
      return;
    }
    const timer = window.setTimeout(() => void loadManifest(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("forum:updated", refresh);
    window.addEventListener("ws:reconnected", refresh);
    return () => {
      window.removeEventListener("forum:updated", refresh);
      window.removeEventListener("ws:reconnected", refresh);
    };
  }, [load]);

  const indexed = useMemo(() => indexDocumentHeadings(thread?.content ?? ""), [thread?.content]);

  if (loading) return <div className="card">Loading forum documentation…</div>;
  if (error || !manifest)
    return (
      <div className="card" role="alert">
        {error || "Forum documentation is unavailable"}
      </div>
    );

  const sections: DocumentationNavSection[] = manifest.categories.map(category => ({
    id: category.id,
    title: category.name,
    articles: manifest.articles
      .filter(article => article.category_id === category.id)
      .map(article => ({
        id: article.id,
        title: article.title,
        href: `/forum/docs/${category.id}/${article.id}`,
        active: String(article.id) === threadId,
        meta: article.reply_count ? `${article.reply_count}` : undefined,
      })),
  }));

  const searchResults =
    search.trim().length >= 2 ? (
      <div className="documentation-search-results">
        {manifest.articles.length ? (
          manifest.articles.map(article => (
            <Link key={article.id} to={`/forum/docs/${article.category_id}/${article.id}`}>
              {article.title}
            </Link>
          ))
        ) : (
          <span>No matching forum guides.</span>
        )}
      </div>
    ) : undefined;

  return (
    <DocumentationShell
      title="Forum documentation"
      description="Browse community knowledge by category"
      catalogHref="/forum"
      catalogLabel="Back to forum"
      sections={sections}
      headings={indexed.headings}
      searchValue={search}
      onSearchChange={setSearch}
      searchResults={searchResults}
      headerActions={
        <>
          <button
            className="action-btn"
            type="button"
            title="Copy link"
            onClick={() =>
              void navigator.clipboard
                .writeText(window.location.href)
                .then(() => toast.success("Link copied"))
            }
          >
            <Copy size={15} />
          </button>
          {thread?.can_edit && (
            <Link
              className="action-btn"
              title="Edit forum guide"
              to={`/form/forum/thread/${thread.id}/edit`}
            >
              <Edit3 size={15} />
            </Link>
          )}
          {thread && (
            <Link
              className="action-btn"
              title="Open full discussion"
              to={`/view-thread/${thread.id}`}
            >
              <MessageSquare size={15} />
            </Link>
          )}
        </>
      }
    >
      {!thread && (
        <div className="documentation-empty">
          <h1>Forum documentation</h1>
          <p>This forum does not have any articles yet.</p>
        </div>
      )}
      {thread && (
        <>
          <header className="documentation-article__hero">
            <h3>{thread.title}</h3>
            <p>Updated {new Date(thread.updated_at).toLocaleDateString()}</p>
          </header>
          <RichTextRenderer className="ProseMirror" html={indexed.html} />
          <section aria-label="Discussion">
            <ViewThreadComments threadId={String(thread.id)} />
          </section>
        </>
      )}
    </DocumentationShell>
  );
}

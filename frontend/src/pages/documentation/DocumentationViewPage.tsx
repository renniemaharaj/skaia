import { Copy, Edit3, Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type {
  DocumentationArticleView,
  DocumentationManifest,
  DocumentationSearchResult,
} from "../../atoms/documentation";
import {
  DocumentationShell,
  type DocumentationNavSection,
} from "../../components/documentation/DocumentationShell";
import { indexDocumentHeadings } from "../../components/documentation/headings";
import { RichTextRenderer } from "../../components/ui/RichTextRenderer";
import { SkeletonContent, SkeletonPrimitive, SkeletonText } from "../../components/ui/Skeleton";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

export default function DocumentationViewPage() {
  const { documentationSlug = "", articleSlug } = useParams<{
    documentationSlug: string;
    articleSlug?: string;
  }>();
  const navigate = useNavigate();
  const { subscribe, unsubscribe } = useWebSocketSync();
  const [manifest, setManifest] = useState<DocumentationManifest | null>(null);
  const [articleView, setArticleView] = useState<DocumentationArticleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DocumentationSearchResult[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const nextManifest = await apiRequest<DocumentationManifest>(
        `/docs/${encodeURIComponent(documentationSlug)}`
      );
      setManifest(nextManifest);
      if (!articleSlug && nextManifest.articles[0]) {
        navigate(`/doc/${nextManifest.documentation.slug}/${nextManifest.articles[0].slug}`, {
          replace: true,
        });
        return;
      }
      if (articleSlug) {
        const nextArticle = await apiRequest<DocumentationArticleView>(
          `/docs/${encodeURIComponent(documentationSlug)}/articles/${encodeURIComponent(articleSlug)}`
        );
        setArticleView(nextArticle);
        subscribe("documentation_article", nextArticle.article.id);
      } else {
        setArticleView(null);
      }
      subscribe("documentation", nextManifest.documentation.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load documentation");
    } finally {
      setLoading(false);
    }
  }, [articleSlug, documentationSlug, navigate, subscribe]);

  useEffect(() => {
    setLoading(true);
    void load();
    return () => {
      if (manifest?.documentation.id) unsubscribe("documentation", manifest.documentation.id);
      if (articleView?.article.id) unsubscribe("documentation_article", articleView.article.id);
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("documentation:updated", refresh);
    window.addEventListener("ws:reconnected", refresh);
    return () => {
      window.removeEventListener("documentation:updated", refresh);
      window.removeEventListener("ws:reconnected", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest<DocumentationSearchResult[]>(
          `/docs/${encodeURIComponent(documentationSlug)}/search?q=${encodeURIComponent(search)}`
        );
        setResults(response ?? []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [documentationSlug, search]);

  const indexed = useMemo(
    () => indexDocumentHeadings(articleView?.article.content ?? ""),
    [articleView?.article.content]
  );

  if (loading)
    return (
      <SkeletonContent className="card" label="Loading documentation">
        <SkeletonPrimitive shape="heading" width="44%" />
        <SkeletonPrimitive width="28%" height={14} />
        <SkeletonText lines={8} />
      </SkeletonContent>
    );
  if (error || !manifest)
    return (
      <div className="card" role="alert">
        {error || "Documentation not found"}
      </div>
    );

  const documentation = manifest.documentation;
  const ungrouped = manifest.articles.filter(article => !article.section_id);
  const navSections: DocumentationNavSection[] = [
    ...(ungrouped.length
      ? [
          {
            id: "overview",
            title: "Overview",
            articles: ungrouped.map(article => ({
              id: article.id,
              title: article.title,
              href: `/doc/${documentation.slug}/${article.slug}`,
              active: article.slug === articleSlug,
            })),
          },
        ]
      : []),
    ...manifest.sections.map(section => ({
      id: section.id,
      title: section.title,
      articles: manifest.articles
        .filter(article => article.section_id === section.id)
        .map(article => ({
          id: article.id,
          title: article.title,
          href: `/doc/${documentation.slug}/${article.slug}`,
          active: article.slug === articleSlug,
        })),
    })),
  ];

  const searchResults =
    results.length > 0 ? (
      <div className="documentation-search-results">
        {results.map(result => (
          <Link
            key={result.article_id}
            to={`/doc/${documentation.slug}/${result.slug}`}
            onClick={() => setSearch("")}
          >
            {result.title}
          </Link>
        ))}
      </div>
    ) : undefined;

  const sidebarActions = documentation.can_edit ? (
    <div className="documentation-sidebar-actions documentation-sidebar-actions--links">
      <Link className="btn btn-ghost" to={`/form/documentation/${documentation.slug}/guide/new`}>
        <Plus size={14} />
        New guide
      </Link>
      <Link className="btn btn-ghost" to={`/form/documentation/${documentation.slug}/settings`}>
        <Settings2 size={14} />
        Manage navigation
      </Link>
    </div>
  ) : undefined;

  return (
    <DocumentationShell
      title={documentation.title}
      description={documentation.description}
      catalogHref="/doc"
      catalogLabel="All documentation"
      sections={navSections}
      headings={indexed.headings}
      searchValue={search}
      onSearchChange={setSearch}
      searchResults={searchResults}
      sidebarActions={sidebarActions}
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
          {documentation.can_edit && articleView && (
            <Link
              className="action-btn"
              title="Edit guide"
              to={`/form/documentation/${documentation.slug}/guide/${articleView.article.slug}/edit`}
            >
              <Edit3 size={15} />
            </Link>
          )}
          {documentation.can_edit && (
            <Link
              className="action-btn"
              title="Documentation settings"
              aria-label="Documentation settings"
              to={`/form/documentation/${documentation.slug}/settings`}
            >
              <Settings2 size={15} />
            </Link>
          )}
        </>
      }
      previous={
        articleView?.previous
          ? {
              href: `/doc/${documentation.slug}/${articleView.previous.slug}`,
              title: articleView.previous.title,
            }
          : undefined
      }
      next={
        articleView?.next
          ? {
              href: `/doc/${documentation.slug}/${articleView.next.slug}`,
              title: articleView.next.title,
            }
          : undefined
      }
    >
      {!articleView && (
        <div className="documentation-empty">
          <h1>{documentation.title}</h1>
          <p>No guides have been created yet.</p>
          {documentation.can_edit && (
            <Link
              className="btn btn-ghost"
              to={`/form/documentation/${documentation.slug}/guide/new`}
            >
              <Plus size={15} />
              Create the first guide
            </Link>
          )}
        </div>
      )}
      {articleView && (
        <>
          <header className="documentation-article__hero">
            <h1>{articleView.article.title}</h1>
            {articleView.article.summary && <p>{articleView.article.summary}</p>}
          </header>
          <RichTextRenderer className="ProseMirror" html={indexed.html} />
        </>
      )}
    </DocumentationShell>
  );
}

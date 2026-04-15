import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Crown,
  Users,
  UserCog2Icon,
  ExternalLink,
  Search,
  LayoutGrid,
  List,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import type { PageBuilderPage, PageUser } from "../../hooks/usePageData";
import type { LandingSection } from "../page/types";
import { BlockRenderer } from "../page/BlockRenderer";
import "./CustomPages.css";

const parsePageSections = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as LandingSection[];
  } catch {
    // ignore invalid content
  }
  return [];
};

const noop = () => {};

type ViewMode = "grid" | "list";

export default function CustomPages() {
  const [pages, setPages] = useState<PageBuilderPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (
      (localStorage.getItem("custom-pages-view-mode") as ViewMode) || "grid"
    );
  });

  useEffect(() => {
    apiRequest<PageBuilderPage[]>("/config/pages/browse")
      .then((data) => setPages(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => {
      apiRequest<PageBuilderPage[]>("/config/pages/browse")
        .then((data) => setPages(data ?? []))
        .catch(() => {});
    };
    window.addEventListener("page:live:event", handler);
    return () => window.removeEventListener("page:live:event", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("custom-pages-view-mode", viewMode);
  }, [viewMode]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter(
      (p) =>
        (p.title ?? "").toLowerCase().includes(q) ||
        (p.slug ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [pages, search]);

  const toggleView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const UserChip = ({ user }: { user: PageUser }) => (
    <span className="cp-user-chip">
      <span className="cp-user-chip__avatar">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.display_name || user.username} />
        ) : (
          <UserCog2Icon size={12} />
        )}
      </span>
      <span className="cp-user-chip__name">
        {user.display_name || user.username}
      </span>
    </span>
  );

  const PageThumb = ({ page }: { page: PageBuilderPage }) => {
    const sections = useMemo(
      () => parsePageSections(page.content),
      [page.content],
    );

    return (
      <div className="cp-card__thumb" data-custom-page-preview>
        {sections.length > 0 ? (
          <div className="cp-card__thumb-inner">
            <BlockRenderer
              sections={sections}
              canEdit={false}
              onUpdateSection={noop}
              onDeleteSection={noop}
              onCreateSection={noop}
              onCreateItem={noop}
              onUpdateItem={noop}
              onDeleteItem={noop}
              onMoveSection={noop}
            />
          </div>
        ) : (
          <div className="cp-card__thumb-empty">No preview</div>
        )}
      </div>
    );
  };

  const [deletingPageId, setDeletingPageId] = useState<number | null>(null);

  const handleDeletePage = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, page: PageBuilderPage) => {
      event.preventDefault();
      event.stopPropagation();
      if (!page.id || !page.can_delete) return;
      if (!window.confirm("Delete this page? This cannot be undone.")) {
        return;
      }
      setDeletingPageId(page.id);
      try {
        await apiRequest(`/config/pages/${page.id}`, {
          method: "DELETE",
        });
        setPages((prev) => prev.filter((p) => p.id !== page.id));
        toast.success("Page deleted");
      } catch {
        toast.error("Failed to delete page");
      } finally {
        setDeletingPageId(null);
      }
    },
    [],
  );

  return (
    <div className="custom-pages">
      <div className="custom-pages__header">
        <div className="custom-pages__header-left">
          <h1 className="custom-pages__title">Custom Pages</h1>
          <p className="custom-pages__subtitle">
            Browse, search, and preview your custom page content.
          </p>
        </div>
        <div className="custom-pages__header-actions">
          <div className="custom-pages__view-toggle">
            <button
              className={`icon-btn icon-btn--lg cp-view-btn ${viewMode === "grid" ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() => toggleView("grid")}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`icon-btn icon-btn--lg cp-view-btn ${viewMode === "list" ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() => toggleView("list")}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {pages.length > 0 && (
        <div className="custom-pages__toolbar">
          <div className="custom-pages__search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search pages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="custom-pages__count">
            {filtered.length} custom page{filtered.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </span>
        </div>
      )}

      {loading && <p className="custom-pages__status">Loading pages…</p>}

      {!loading && pages.length === 0 && (
        <div className="custom-pages__empty">
          <FileText size={32} />
          <p>No custom pages yet.</p>
        </div>
      )}

      {!loading && pages.length > 0 && filtered.length === 0 && (
        <div className="custom-pages__empty">
          <FileText size={32} />
          <p>No pages match your search.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && viewMode === "grid" && (
        <div className="custom-pages__grid">
          {filtered.map((page) => (
            <Link
              key={page.id}
              to={page.is_index ? "/" : `/page/${page.slug}`}
              className="cp-card card card--interactive"
            >
              <div className="cp-card__top">
                <div className="cp-card__top-left">
                  <h3 className="cp-card__title">{page.title || page.slug}</h3>
                </div>
                <div className="cp-card__top-actions">
                  {page.can_delete && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm icon-btn--danger cp-delete-btn"
                      onClick={(event) => handleDeletePage(event, page)}
                      disabled={deletingPageId === page.id}
                      title="Delete page"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <ExternalLink size={14} className="cp-card__link-icon" />
                </div>
              </div>

              {page.description && (
                <p className="cp-card__desc">{page.description}</p>
              )}

              <PageThumb page={page} />

              <div className="cp-card__meta">
                {page.owner && (
                  <div className="cp-card__meta-row">
                    <Crown size={12} />
                    <UserChip user={page.owner} />
                  </div>
                )}
                {page.editors && page.editors.length > 0 && (
                  <div className="cp-card__meta-row">
                    <Users size={12} />
                    <span className="cp-card__editors">
                      {page.editors.slice(0, 3).map((e) => (
                        <UserChip key={e.id} user={e} />
                      ))}
                      {page.editors.length > 3 && (
                        <span className="cp-card__more">
                          +{page.editors.length - 3}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <span className="cp-card__time">
                  Updated {relativeTimeAgo(page.updated_at)}
                </span>
              </div>

              {page.is_index && (
                <span className="cp-card__badge">Homepage</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && viewMode === "list" && (
        <div className="custom-pages__list">
          <div className="cp-list__header">
            <span className="cp-list__col">Page</span>
            <span className="cp-list__col">Description</span>
            <span className="cp-list__col">Owner</span>
            <span className="cp-list__col">Updated</span>
            <span className="cp-list__col cp-list__col--action">Action</span>
          </div>
          {filtered.map((page) => (
            <Link
              key={page.id}
              to={page.is_index ? "/" : `/page/${page.slug}`}
              className="cp-list__row"
            >
              <span className="cp-list__col cp-list__col--name">
                <span className="cp-list__name">{page.title || page.slug}</span>
                {page.is_index && (
                  <span className="cp-card__badge cp-card__badge--inline">
                    Homepage
                  </span>
                )}
              </span>
              <span className="cp-list__col cp-list__col--desc">
                {page.description || "—"}
              </span>
              <span className="cp-list__col cp-list__col--owner">
                {page.owner ? (
                  <UserChip user={page.owner} />
                ) : (
                  <span className="cp-list__none">—</span>
                )}
              </span>
              <span className="cp-list__col cp-list__col--updated">
                {relativeTimeAgo(page.updated_at)}
              </span>
              <span className="cp-list__col cp-list__col--action">
                {page.can_delete ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm icon-btn--danger cp-delete-btn"
                    onClick={(event) => handleDeletePage(event, page)}
                    disabled={deletingPageId === page.id}
                    title="Delete page"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span className="cp-list__none">—</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

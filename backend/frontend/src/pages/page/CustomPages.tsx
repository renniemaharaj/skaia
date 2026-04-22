import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  Crown,
  Users,
  ExternalLink,
  Search,
  LayoutGrid,
  List,
  Trash2,
  Plus,
  EyeOff,
  Copy,
  Pencil,
  BarChart3,
  Home,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { currentUserAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { useSetHomepage } from "../../hooks/useSetHomepage";
import { usePageData } from "../../hooks/usePageData";
import { relativeTimeAgo } from "../../utils/serverTime";
import type { PageBuilderDoc, PageUser } from "../../hooks/usePageData";
import type { PageSection } from "./types";
import { BlockRenderer } from "./BlockRenderer";
import UserAvatar from "../../components/user/UserAvatar";
import ResourceAnalytics from "../../components/analytics/ResourceAnalytics";
import "./CustomPages.css";

const parsePageSections = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as PageSection[];
  } catch {
    // ignore invalid content
  }
  return [];
};

const noop = () => {};

type ViewMode = "grid" | "list";

interface Allocation {
  max_pages: number;
  used_pages: number;
  has_allocation?: boolean;
  is_admin?: boolean;
}

export default function CustomPages() {
  const currentUser = useAtomValue(currentUserAtom);
  const navigate = useNavigate();
  const [pages, setPages] = useState<PageBuilderDoc[]>([]);
  const [landingPageSlug, setLandingPageSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [renamingPage, setRenamingPage] = useState<PageBuilderDoc | null>(null);
  const [duplicatingPage, setDuplicatingPage] = useState<PageBuilderDoc | null>(
    null,
  );
  const [renameTitle, setRenameTitle] = useState("");
  const [renameSlug, setRenameSlug] = useState("");
  const [dupSlug, setDupSlug] = useState("");
  const [dupTitle, setDupTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [analyticsPage, setAnalyticsPage] = useState<PageBuilderDoc | null>(
    null,
  );
  // Homepage setting logic (shared hook)
  const { handleSetHomepage, settingHomepageId } = useSetHomepage(
    landingPageSlug,
    setLandingPageSlug,
  );

  // Permission logic for homepage management
  const hasPermission = usePageData().isAdmin; // home.manage permission
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (
      (localStorage.getItem("custom-pages-view-mode") as ViewMode) || "grid"
    );
  });

  useEffect(() => {
    apiRequest<{ pages: PageBuilderDoc[]; landing_page_slug: string }>(
      "/pages/browse",
    )
      .then((data) => {
        setPages(data?.pages ?? []);
        setLandingPageSlug(data?.landing_page_slug ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => {
      apiRequest<{ pages: PageBuilderDoc[]; landing_page_slug: string }>(
        "/pages/browse",
      )
        .then((data) => {
          setPages(data?.pages ?? []);
          setLandingPageSlug(data?.landing_page_slug ?? "");
        })
        .catch(() => {});
    };
    window.addEventListener("page:live:event", handler);
    return () => window.removeEventListener("page:live:event", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("custom-pages-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!currentUser) return;
    apiRequest<Allocation>("/pages/my-allocation")
      .then((data) => setAllocation(data))
      .catch(() => {});
  }, [currentUser]);

  const handleClaimPage = useCallback(async () => {
    setClaiming(true);
    try {
      const page = await apiRequest<PageBuilderDoc>("/pages/claim", {
        method: "POST",
      });
      toast.success("Page created!");
      navigate(`/page/${page.slug}`);
    } catch {
      toast.error("Failed to create page");
    } finally {
      setClaiming(false);
    }
  }, [navigate]);

  const openRename = useCallback(
    (e: MouseEvent<HTMLButtonElement>, page: PageBuilderDoc) => {
      e.preventDefault();
      e.stopPropagation();
      setRenameTitle(page.title || page.slug);
      setRenameSlug(page.slug);
      setRenamingPage(page);
    },
    [],
  );

  const handleRename = useCallback(async () => {
    if (!renamingPage || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const updated = await apiRequest<PageBuilderDoc>(
        `/pages/${renamingPage.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...renamingPage,
            title: renameTitle.trim(),
            slug: renameSlug.trim() || renamingPage.slug,
          }),
        },
      );
      setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("Page renamed");
      setRenamingPage(null);
    } catch {
      toast.error("Failed to rename page");
    } finally {
      setRenaming(false);
    }
  }, [renamingPage, renameTitle, renameSlug]);

  const openDuplicate = useCallback(
    (e: MouseEvent<HTMLButtonElement>, page: PageBuilderDoc) => {
      e.preventDefault();
      e.stopPropagation();
      setDupSlug(`${page.slug}-copy`);
      setDupTitle(`${page.title || page.slug} (Copy)`);
      setDuplicatingPage(page);
    },
    [],
  );

  const handleDuplicate = useCallback(async () => {
    if (!duplicatingPage || !dupSlug.trim()) return;
    setDuplicating(true);
    try {
      const created = await apiRequest<PageBuilderDoc>(
        `/pages/${duplicatingPage.id}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({
            slug: dupSlug.trim(),
            title: dupTitle.trim() || dupSlug.trim(),
          }),
        },
      );
      setPages((prev) => [...prev, created]);
      apiRequest<Allocation>("/pages/my-allocation")
        .then((data) => setAllocation(data))
        .catch(() => {});
      toast.success("Page duplicated");
      setDuplicatingPage(null);
      navigate(`/page/${created.slug}`);
    } catch {
      toast.error("Failed to duplicate page");
    } finally {
      setDuplicating(false);
    }
  }, [duplicatingPage, dupSlug, dupTitle, navigate]);

  const canClaim =
    !!currentUser &&
    !!allocation &&
    (allocation.is_admin || allocation.used_pages < allocation.max_pages);

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
        <UserAvatar
          src={user.avatar_url || undefined}
          alt={user.display_name || user.username}
          size={12}
          initials={(user.display_name || user.username)?.[0]?.toUpperCase()}
        />
      </span>
      <span className="cp-user-chip__name">
        {user.display_name || user.username}
      </span>
    </span>
  );

  const PageThumb = ({ page }: { page: PageBuilderDoc }) => {
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
    async (event: MouseEvent<HTMLButtonElement>, page: PageBuilderDoc) => {
      event.preventDefault();
      event.stopPropagation();
      if (!page.id || !page.can_delete) return;
      if (!window.confirm("Delete this page? This cannot be undone.")) {
        return;
      }
      setDeletingPageId(page.id);
      try {
        await apiRequest(`/pages/${page.id}`, {
          method: "DELETE",
        });
        setPages((prev) => prev.filter((p) => p.id !== page.id));
        // Refresh allocation count after deletion
        apiRequest<Allocation>("/pages/my-allocation")
          .then((data) => setAllocation(data))
          .catch(() => {});
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
          {canClaim && (
            <button
              className="btn btn-primary cp-new-page-btn"
              onClick={handleClaimPage}
              disabled={claiming}
            >
              <Plus size={16} />
              {claiming ? "Creating…" : "New Page"}
            </button>
          )}
          {currentUser && allocation && !allocation.is_admin && (
            <span className="cp-allocation-badge">
              {allocation.used_pages}/{allocation.max_pages} pages
            </span>
          )}
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
              to={page.slug === landingPageSlug ? "/" : `/page/${page.slug}`}
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
                      className="icon-btn icon-btn--sm icon-btn--subtle cp-action-btn"
                      onClick={(e) => openRename(e, page)}
                      title="Rename page"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm icon-btn--subtle cp-action-btn"
                    onClick={(e) => openDuplicate(e, page)}
                    title="Duplicate page"
                  >
                    <Copy size={14} />
                  </button>
                  {(page.can_delete || page.can_edit) && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm icon-btn--subtle cp-action-btn"
                      onClick={(e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAnalyticsPage(page);
                      }}
                      title="Analytics"
                    >
                      <BarChart3 size={14} />
                    </button>
                  )}
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

              {page.slug === landingPageSlug && (
                <span className="cp-card__badge">Landing Page</span>
              )}
              {page.can_delete && hasPermission && (
                <button
                  type="button"
                  className={`icon-btn icon-btn--sm cp-action-btn${page.slug === landingPageSlug ? " is-active" : ""}`}
                  title={
                    page.slug === landingPageSlug
                      ? "Current homepage"
                      : "Set as homepage"
                  }
                  disabled={
                    page.slug === landingPageSlug ||
                    settingHomepageId === page.id
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSetHomepage(page);
                  }}
                  style={{ marginLeft: 8 }}
                >
                  <Home size={14} />
                </button>
              )}
              {page.visibility === "private" && (
                <span className="cp-card__badge cp-card__badge--private">
                  <EyeOff size={10} /> Private
                </span>
              )}
              {page.visibility === "unlisted" && (
                <span className="cp-card__badge cp-card__badge--unlisted">
                  <EyeOff size={10} /> Unlisted
                </span>
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
              to={page.slug === landingPageSlug ? "/" : `/page/${page.slug}`}
              className="cp-list__row"
            >
              <span className="cp-list__col cp-list__col--name">
                <span className="cp-list__name">{page.title || page.slug}</span>
                {page.slug === landingPageSlug && (
                  <span className="cp-card__badge cp-card__badge--inline">
                    Landing Page
                  </span>
                )}
                {page.can_delete && hasPermission && (
                  <button
                    type="button"
                    className={`icon-btn icon-btn--sm cp-action-btn${page.slug === landingPageSlug ? " is-active" : ""}`}
                    title={
                      page.slug === landingPageSlug
                        ? "Current homepage"
                        : "Set as homepage"
                    }
                    disabled={
                      page.slug === landingPageSlug ||
                      settingHomepageId === page.id
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSetHomepage(page);
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    <Home size={14} />
                  </button>
                )}
                {page.visibility === "private" && (
                  <span className="cp-card__badge cp-card__badge--inline cp-card__badge--private">
                    <EyeOff size={10} /> Private
                  </span>
                )}
                {page.visibility === "unlisted" && (
                  <span className="cp-card__badge cp-card__badge--inline cp-card__badge--unlisted">
                    <EyeOff size={10} /> Unlisted
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
                {page.can_delete && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm icon-btn--subtle cp-action-btn"
                    onClick={(e) => openRename(e, page)}
                    title="Rename page"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn icon-btn--sm icon-btn--subtle cp-action-btn"
                  onClick={(e) => openDuplicate(e, page)}
                  title="Duplicate page"
                >
                  <Copy size={14} />
                </button>
                {(page.can_delete || page.can_edit) && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm icon-btn--subtle cp-action-btn"
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAnalyticsPage(page);
                    }}
                    title="Analytics"
                  >
                    <BarChart3 size={14} />
                  </button>
                )}
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

      {renamingPage && (
        <div className="cp-modal-overlay" onClick={() => setRenamingPage(null)}>
          <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cp-modal__title">Rename page</h3>
            <label className="cp-modal__label">
              Title
              <input
                type="text"
                className="cp-modal__input"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                autoFocus
              />
            </label>
            <label className="cp-modal__label">
              Slug
              <input
                type="text"
                className="cp-modal__input"
                value={renameSlug}
                onChange={(e) => setRenameSlug(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
            </label>
            <div className="cp-modal__actions">
              <button
                className="btn btn-ghost"
                onClick={() => setRenamingPage(null)}
                disabled={renaming}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRename}
                disabled={renaming || !renameTitle.trim()}
              >
                {renaming ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicatingPage && (
        <div
          className="cp-modal-overlay"
          onClick={() => setDuplicatingPage(null)}
        >
          <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cp-modal__title">Duplicate page</h3>
            <label className="cp-modal__label">
              New slug
              <input
                type="text"
                className="cp-modal__input"
                value={dupSlug}
                onChange={(e) => setDupSlug(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDuplicate()}
                autoFocus
              />
            </label>
            <label className="cp-modal__label">
              New title
              <input
                type="text"
                className="cp-modal__input"
                value={dupTitle}
                onChange={(e) => setDupTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDuplicate()}
              />
            </label>
            <div className="cp-modal__actions">
              <button
                className="btn btn-ghost"
                onClick={() => setDuplicatingPage(null)}
                disabled={duplicating}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDuplicate}
                disabled={duplicating || !dupSlug.trim()}
              >
                {duplicating ? "Duplicating…" : "Duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {analyticsPage && (
        <ResourceAnalytics
          resource="page"
          resourceId={analyticsPage.id}
          title={analyticsPage.title || analyticsPage.slug}
          onClose={() => setAnalyticsPage(null)}
        />
      )}
    </div>
  );
}

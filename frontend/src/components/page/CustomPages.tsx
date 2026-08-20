import { useAtomValue } from "jotai";
import {
  BarChart3,
  Copy,
  Crown,
  ExternalLink,
  EyeOff,
  FileText,
  Home,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Suspense, type MouseEvent, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { currentUserAtom } from "../../atoms/auth";
import { useLayoutPosition } from "../../atoms/viewModes";
import { usePageData } from "../../hooks/usePageData";
import type { PageBuilderDoc, PageUser } from "../../hooks/usePageData";
import { useSetHomepage } from "../../hooks/useSetHomepage";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import { AnalyticsSkeleton } from "../analytics/AnalyticsSkeleton";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { useViewportActivation } from "../ui/DeferredRender";
import { confirmDestructiveAction } from "../ui/Prompt";
import { SkeletonContent } from "../ui/Skeleton";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import { PageBrowsePreview } from "./PageBrowsePreview";
import { DirectoryLayout } from "./layout/templates/DirectoryLayout";
import "./CustomPages.css";

const ResourceAnalytics = lazy(() => import("../analytics/ResourceAnalytics"));

type ViewMode = "grid" | "list";

interface Allocation {
  max_pages: number;
  used_pages: number;
  has_allocation?: boolean;
  is_admin?: boolean;
}

export interface PageBrowseSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "private" | "unlisted";
  owner?: PageUser;
  editors: PageUser[];
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
}

interface BrowseResponse {
  pages: PageBrowseSummary[];
  landing_page_slug: string;
  next_cursor?: string;
  has_more: boolean;
}

function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const viewport = useViewportActivation({ rootMargin: "320px 0px", onActivate: onVisible });
  return (
    <div ref={viewport.ref} className="custom-pages__sentinel" aria-label="Loading more pages">
      <SkeletonContent variant="table-row" label="Loading more pages" />
    </div>
  );
}

export default function CustomPages() {
  const currentUser = useAtomValue(currentUserAtom);
  const navigate = useNavigate();
  const [pages, setPages] = useState<PageBrowseSummary[]>([]);
  const [landingPageSlug, setLandingPageSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [renamingPage, setRenamingPage] = useState<PageBrowseSummary | null>(null);
  const [duplicatingPage, setDuplicatingPage] = useState<PageBrowseSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameSlug, setRenameSlug] = useState("");
  const [dupSlug, setDupSlug] = useState("");
  const [dupTitle, setDupTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [analyticsPage, setAnalyticsPage] = useState<PageBrowseSummary | null>(null);
  const browseAbortRef = useRef<AbortController | null>(null);
  // Homepage setting logic (shared hook)
  const { handleSetHomepage, settingHomepageId } = useSetHomepage(
    landingPageSlug,
    setLandingPageSlug
  );

  // Permission logic for homepage management
  const hasPermission = usePageData().isAdmin; // home.manage permission
  const [viewMode, setViewMode] = useLayoutPosition<ViewMode>("customPages", "grid");

  const loadPages = useCallback(async (query: string, cursor = "", append = false) => {
    browseAbortRef.current?.abort();
    const controller = new AbortController();
    browseAbortRef.current = controller;
    append ? setLoadingMore(true) : setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ limit: "24" });
    if (query.trim()) params.set("q", query.trim());
    if (cursor) params.set("cursor", cursor);
    try {
      const data = await apiRequest<BrowseResponse>(`/pages/browse?${params}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPages(previous => {
        if (!append) return data.pages ?? [];
        const byID = new Map(previous.map(page => [page.id, page]));
        for (const page of data.pages ?? []) byID.set(page.id, page);
        return Array.from(byID.values());
      });
      setLandingPageSlug(data.landing_page_slug ?? "");
      setNextCursor(data.next_cursor ?? "");
      setHasMore(Boolean(data.has_more && data.next_cursor));
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") setLoadError(true);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPages(search), 250);
    return () => {
      window.clearTimeout(timer);
      browseAbortRef.current?.abort();
    };
  }, [loadPages, search]);

  useEffect(() => {
    const handler = () => void loadPages(search);
    window.addEventListener("page:live:event", handler);
    return () => window.removeEventListener("page:live:event", handler);
  }, [loadPages, search]);

  useEffect(() => {
    if (!currentUser) return;
    apiRequest<Allocation>("/pages/my-allocation")
      .then(data => setAllocation(data))
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

  const openRename = useCallback((e: MouseEvent<HTMLButtonElement>, page: PageBrowseSummary) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameTitle(page.title || page.slug);
    setRenameSlug(page.slug);
    setRenamingPage(page);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renamingPage || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const updated = await apiRequest<PageBuilderDoc>(`/pages/${renamingPage.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: renameTitle.trim(),
          slug: renameSlug.trim() || renamingPage.slug,
        }),
      });
      setPages(prev =>
        prev.map(page =>
          page.id === updated.id
            ? {
                ...page,
                slug: updated.slug,
                title: updated.title,
                updated_at: updated.updated_at,
              }
            : page
        )
      );
      toast.success("Page renamed");
      setRenamingPage(null);
    } catch {
      toast.error("Failed to rename page");
    } finally {
      setRenaming(false);
    }
  }, [renamingPage, renameTitle, renameSlug]);

  const openDuplicate = useCallback((e: MouseEvent<HTMLButtonElement>, page: PageBrowseSummary) => {
    e.preventDefault();
    e.stopPropagation();
    setDupSlug(`${page.slug}-copy`);
    setDupTitle(`${page.title || page.slug} (Copy)`);
    setDuplicatingPage(page);
  }, []);

  const handleDuplicate = useCallback(async () => {
    if (!duplicatingPage || !dupSlug.trim()) return;
    setDuplicating(true);
    try {
      const created = await apiRequest<PageBuilderDoc>(`/pages/${duplicatingPage.id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({
          slug: dupSlug.trim(),
          title: dupTitle.trim() || dupSlug.trim(),
        }),
      });
      apiRequest<Allocation>("/pages/my-allocation")
        .then(data => setAllocation(data))
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

  const toggleView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const UserChip = ({ user }: { user: PageUser }) => (
    <UserProfileOverlay
      userId={user.id}
      fallbackName={user.display_name || user.username}
      fallbackAvatar={user.avatar_url || undefined}
    >
      <span className="cp-user-chip">
        <span className="cp-user-chip__avatar">
          <UserAvatar
            src={user.avatar_url || undefined}
            alt={user.display_name || user.username}
            size={16}
            initials={(user.display_name || user.username)?.[0]?.toUpperCase()}
          />
        </span>
        <span className="cp-user-chip__name">{user.display_name || user.username}</span>
      </span>
    </UserProfileOverlay>
  );

  const [deletingPageId, setDeletingPageId] = useState<number | null>(null);

  const handleDeletePage = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, page: PageBrowseSummary) => {
      event.preventDefault();
      event.stopPropagation();
      if (!page.id || !page.can_delete) return;
      if (
        !(await confirmDestructiveAction({
          title: `Delete ${page.title || page.slug}?`,
          body: "The page will move to Trash. Its sections and responses remain retained but hidden.",
          confirmLabel: "Delete page",
        }))
      ) {
        return;
      }
      setDeletingPageId(page.id);
      try {
        await apiRequest(`/pages/${page.id}`, {
          method: "DELETE",
        });
        setPages(prev => prev.filter(p => p.id !== page.id));
        // Refresh allocation count after deletion
        apiRequest<Allocation>("/pages/my-allocation")
          .then(data => setAllocation(data))
          .catch(() => {});
        toast.success("Page deleted");
      } catch {
        toast.error("Failed to delete page");
      } finally {
        setDeletingPageId(null);
      }
    },
    []
  );

  return (
    <>
      <DirectoryLayout
        className="custom-pages"
        title="Custom Pages"
        subtitle="Browse, search, and preview your custom page content."
        headerActions={
          <>
            {canClaim && (
              <button
                className="btn btn-ghost cp-new-page-btn"
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
          </>
        }
        searchPlaceholder="Search pages…"
        searchValue={search}
        onSearchChange={setSearch}
        metrics={[
          <span key="count" className="custom-pages__count">
            <strong>{pages.length}</strong> {pages.length === 1 ? "Page" : "Pages"} loaded
            {search && ` matching "${search}"`}
          </span>,
        ]}
        viewMode={viewMode}
        onViewModeChange={toggleView}
        items={loading ? [] : pages}
        emptyState={
          loading ? (
            <div className="custom-pages__loading" aria-label="Loading custom pages">
              <SkeletonContent variant="card" label="Loading custom pages" />
              <SkeletonContent variant="card" label="Loading custom pages" />
              <SkeletonContent variant="card" label="Loading custom pages" />
            </div>
          ) : loadError ? (
            <div className="custom-pages__empty" role="alert">
              <FileText size={32} />
              <p>Custom pages could not load.</p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void loadPages(search)}
              >
                Retry
              </button>
            </div>
          ) : pages.length === 0 ? (
            <div className="custom-pages__empty">
              <FileText size={32} />
              <p>No custom pages yet.</p>
            </div>
          ) : (
            <div className="custom-pages__empty">
              <FileText size={32} />
              <p>No pages match your search.</p>
            </div>
          )
        }
        tableColumns={[
          {
            header: "Page",
            width: "minmax(200px, 2fr)",
            className: "table-view__cell--bold",
            cell: page => (
              <>
                <span className="cp-list__name">{page.title || page.slug}</span>
                {page.slug === landingPageSlug && (
                  <span className="cp-card__badge cp-card__badge--inline">Landing Page</span>
                )}
                {page.can_delete && hasPermission && (
                  <button
                    type="button"
                    className={`action-btn${page.slug === landingPageSlug ? " is-active" : ""}`}
                    title={page.slug === landingPageSlug ? "Current homepage" : "Set as homepage"}
                    disabled={page.slug === landingPageSlug || settingHomepageId === page.id}
                    onClick={e => {
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
              </>
            ),
          },
          {
            header: "Description",
            width: "minmax(250px, 3fr)",
            className: "table-view__cell--muted",
            cell: page => page.description || "-",
          },
          {
            header: "Owner",
            width: "minmax(150px, 1.5fr)",
            cell: page =>
              page.owner ? (
                <UserChip user={page.owner} />
              ) : (
                <span className="cp-list__none">-</span>
              ),
          },
          {
            header: "Updated",
            width: "minmax(120px, 1fr)",
            className: "table-view__cell--muted",
            cell: page => relativeTimeAgo(page.updated_at),
          },
          {
            header: "Action",
            width: "120px",
            className: "table-view__cell--actions",
            cell: page => (
              <div className="table-view__row-actions">
                {page.can_delete && (
                  <button
                    type="button"
                    className="action-btn"
                    onClick={e => openRename(e, page)}
                    title="Rename page"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="action-btn"
                  onClick={e => openDuplicate(e, page)}
                  title="Duplicate page"
                >
                  <Copy size={14} />
                </button>
                {(page.can_delete || page.can_edit) && (
                  <button
                    type="button"
                    className="action-btn"
                    onClick={e => {
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
                    className="action-btn danger"
                    onClick={event => handleDeletePage(event, page)}
                    disabled={deletingPageId === page.id}
                    title="Delete page"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span className="cp-list__none">-</span>
                )}
              </div>
            ),
          },
        ]}
        tableRowKey={page => page.id}
        renderGridCard={page => (
          <ContentFlatCard
            key={page.id}
            style={{ display: "flex", padding: 0, margin: 0 }}
            spotlightColor="rgba(var(--primary-color-rgb), 0.15)"
          >
            <Link
              to={page.slug === landingPageSlug ? "/" : `/page/${page.slug}`}
              className="cp-card"
              style={{
                flex: 1,
                margin: 0,
                border: "none",
                background: "transparent",
                boxShadow: "none",
              }}
            >
              <div className="cp-card__top">
                <div className="cp-card__top-left">
                  <h3 className="cp-card__title">{page.title || page.slug}</h3>
                </div>
                <div className="cp-card__top-actions">
                  {page.can_delete && (
                    <button
                      type="button"
                      className="action-btn cp-action-btn"
                      onClick={e => openRename(e, page)}
                      title="Rename page"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="action-btn cp-action-btn"
                    onClick={e => openDuplicate(e, page)}
                    title="Duplicate page"
                  >
                    <Copy size={14} />
                  </button>
                  {(page.can_delete || page.can_edit) && (
                    <button
                      type="button"
                      className="action-btn cp-action-btn"
                      onClick={e => {
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
                      className="action-btn danger cp-danger-btn"
                      onClick={event => handleDeletePage(event, page)}
                      disabled={deletingPageId === page.id}
                      title="Delete page"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <ExternalLink size={14} className="cp-card__link-icon" />
                </div>
              </div>

              {page.description && <p className="cp-card__desc">{page.description}</p>}

              <PageBrowsePreview pageId={page.id} revision={page.updated_at} />

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
                      {page.editors.slice(0, 3).map(e => (
                        <UserChip key={e.id} user={e} />
                      ))}
                      {page.editors.length > 3 && (
                        <span className="cp-card__more">+{page.editors.length - 3}</span>
                      )}
                    </span>
                  </div>
                )}
                <span className="cp-card__time">Updated {relativeTimeAgo(page.updated_at)}</span>
              </div>

              {page.slug === landingPageSlug && (
                <span className="cp-card__badge">Landing Page</span>
              )}
              {page.can_delete && hasPermission && (
                <button
                  type="button"
                  className={`action-btn cp-action-btn${page.slug === landingPageSlug ? " is-active" : ""}`}
                  title={page.slug === landingPageSlug ? "Current homepage" : "Set as homepage"}
                  disabled={page.slug === landingPageSlug || settingHomepageId === page.id}
                  onClick={e => {
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
          </ContentFlatCard>
        )}
        renderRowWrapper={(page, _, props, cells) => (
          <Link
            key={page.id}
            to={page.slug === landingPageSlug ? "/" : `/page/${page.slug}`}
            {...props}
          >
            {cells}
          </Link>
        )}
      />

      {hasMore && nextCursor && !loading && (
        <LoadMoreSentinel
          key={nextCursor}
          onVisible={() => {
            if (!loadingMore) void loadPages(search, nextCursor, true);
          }}
        />
      )}

      {renamingPage && (
        <div className="cp-modal-overlay" onClick={() => setRenamingPage(null)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <h3 className="cp-modal__title">Rename page</h3>
            <label className="cp-modal__label">
              Title
              <input
                type="text"
                className="cp-modal__input"
                value={renameTitle}
                onChange={e => setRenameTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRename()}
              />
            </label>
            <label className="cp-modal__label">
              Slug
              <input
                type="text"
                className="cp-modal__input"
                value={renameSlug}
                onChange={e => setRenameSlug(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRename()}
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
        <div className="cp-modal-overlay" onClick={() => setDuplicatingPage(null)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <h3 className="cp-modal__title">Duplicate page</h3>
            <label className="cp-modal__label">
              New slug
              <input
                type="text"
                className="cp-modal__input"
                value={dupSlug}
                onChange={e => setDupSlug(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleDuplicate()}
              />
            </label>
            <label className="cp-modal__label">
              New title
              <input
                type="text"
                className="cp-modal__input"
                value={dupTitle}
                onChange={e => setDupTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleDuplicate()}
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
        <Suspense fallback={<AnalyticsSkeleton onClose={() => setAnalyticsPage(null)} />}>
          <ResourceAnalytics
            resource="page"
            resourceId={analyticsPage.id}
            title={analyticsPage.title || analyticsPage.slug}
            onClose={() => setAnalyticsPage(null)}
          />
        </Suspense>
      )}
    </>
  );
}

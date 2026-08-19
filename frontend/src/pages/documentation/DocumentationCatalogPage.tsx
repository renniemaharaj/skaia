import { useAtomValue } from "jotai";
import { BookOpen, EyeOff, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { hasPermissionAtom, isAuthenticatedAtom } from "../../atoms/auth";
import type { Documentation } from "../../atoms/documentation";
import { useLayoutPosition } from "../../atoms/viewModes";
import { DirectoryLayout, type ViewMode } from "../../components/page/layout/templates/DirectoryLayout";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import "../../components/documentation/DocumentationShell.css";

export default function DocumentationCatalogPage() {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const canCreate = hasPermission("docs.create");
  const [items, setItems] = useState<Documentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useLayoutPosition<ViewMode>("documentation", "grid");

  const load = useCallback(async () => {
    try {
      setError(null);
      const publicItems = await apiRequest<Documentation[]>("/docs/");
      const ownedItems = isAuthenticated ? await apiRequest<Documentation[]>("/docs/mine") : [];
      const merged = new Map<number, Documentation>();
      for (const item of [...(publicItems ?? []), ...(ownedItems ?? [])]) merged.set(item.id, item);
      setItems([...merged.values()].sort((left, right) => left.title.localeCompare(right.title)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load documentation");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("documentation:updated", refresh);
    return () => window.removeEventListener("documentation:updated", refresh);
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter(item =>
      [item.title, item.slug, item.description, item.visibility].some(value =>
        value.toLocaleLowerCase().includes(query)
      )
    );
  }, [items, search]);

  const emptyState = (
    <div className="documentation-directory__empty">
      <BookOpen size={30} />
      <h2>{items.length ? "No matching documentation" : "No documentation yet"}</h2>
      <p>
        {items.length
          ? "Try a different title, URL, description, or visibility."
          : "Create a collection to start organizing guides for your readers."}
      </p>
    </div>
  );

  return (
    <DirectoryLayout
      className="documentation-directory"
      title="Documentation"
      subtitle="Browse and maintain this site's guide collections."
      searchPlaceholder="Search documentation..."
      searchValue={search}
      onSearchChange={setSearch}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      headerActions={canCreate ? (
        <Link className="btn btn-ghost documentation-directory__new" to="/form/documentation/new">
          <Plus size={16} /> New documentation
        </Link>
      ) : undefined}
      metrics={[
        <span key="count">
          <strong>{filtered.length}</strong> {filtered.length === 1 ? "collection" : "collections"}
        </span>,
      ]}
      items={loading || error ? [] : filtered}
      emptyState={
        loading ? <p className="documentation-directory__status">Loading documentation...</p>
        : error ? <p className="documentation-directory__status" role="alert">{error}</p>
        : emptyState
      }
      tableColumns={[
        {
          header: "Documentation",
          width: "minmax(210px, 2fr)",
          className: "table-view__cell--bold",
          cell: item => <span className="documentation-directory__table-title"><BookOpen size={15} />{item.title}</span>,
        },
        {
          header: "Description",
          width: "minmax(260px, 3fr)",
          className: "table-view__cell--muted",
          cell: item => item.description || "No description",
        },
        {
          header: "Visibility",
          width: "120px",
          cell: item => <span className={`documentation-visibility documentation-visibility--${item.visibility}`}>{item.visibility === "private" && <EyeOff size={12} />}{item.visibility}</span>,
        },
        {
          header: "Updated",
          width: "140px",
          className: "table-view__cell--muted",
          cell: item => relativeTimeAgo(item.updated_at),
        },
      ]}
      tableRowKey={item => item.id}
      renderRowWrapper={(item, _index, rowProps, cells) => (
        <Link key={item.id} to={`/doc/${item.slug}`} {...rowProps}>{cells}</Link>
      )}
      renderGridCard={item => (
        <Link className="documentation-directory__card" to={`/doc/${item.slug}`} key={item.id}>
          <div className="documentation-directory__card-heading">
            <span className="documentation-directory__card-icon"><BookOpen size={18} /></span>
            <span className={`documentation-visibility documentation-visibility--${item.visibility}`}>{item.visibility === "private" && <EyeOff size={12} />}{item.visibility}</span>
          </div>
          <div className="documentation-directory__card-body">
            <h2>{item.title}</h2>
            <p>{item.description || "Open this documentation collection."}</p>
          </div>
          <div className="documentation-directory__card-meta">
            <span>/doc/{item.slug}</span>
            <span>Updated {relativeTimeAgo(item.updated_at)}</span>
          </div>
        </Link>
      )}
    />
  );
}

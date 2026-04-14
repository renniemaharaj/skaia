import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Database,
  Plus,
  Search,
  Code2,
  Clock,
  UserCircle2,
  Trash2,
  LayoutGrid,
  List,
  Zap,
} from "lucide-react";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import type {
  DataSource,
  DataSourceCreator,
} from "../../components/landing/types";
import { toast } from "sonner";
import "./DataSources.css";

type ViewMode = "grid" | "list";

export default function DataSourcesPage() {
  const navigate = useNavigate();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("ds-view-mode") as ViewMode) || "grid",
  );

  const fetchAll = useCallback(async () => {
    try {
      const list = await apiRequest<DataSource[]>("/config/datasources");
      setDataSources(list ?? []);
    } catch {
      toast.error("Failed to load data sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("ds-view-mode", mode);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this data source?")) return;
    try {
      await apiRequest(`/config/datasources/${id}`, { method: "DELETE" });
      toast.success("Data source deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return dataSources;
    const q = search.toLowerCase();
    return dataSources.filter(
      (ds) =>
        ds.name.toLowerCase().includes(q) ||
        ds.description.toLowerCase().includes(q) ||
        ds.creator?.display_name?.toLowerCase().includes(q) ||
        ds.creator?.username?.toLowerCase().includes(q),
    );
  }, [dataSources, search]);

  const CreatorChip = ({ creator }: { creator?: DataSourceCreator }) => {
    if (!creator) return <span className="ds-meta-value">System</span>;
    return (
      <span className="ds-creator-chip">
        <span className="ds-creator-chip__avatar">
          {creator.avatar_url ? (
            <img
              src={creator.avatar_url}
              alt={creator.display_name || creator.username}
            />
          ) : (
            <UserCircle2 size={14} />
          )}
        </span>
        <span className="ds-creator-chip__name">
          {creator.display_name || creator.username}
        </span>
      </span>
    );
  };

  const codePreview = (code: string) => {
    const lines = code
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("//"));
    return lines.slice(0, 3).join("\n") || "// empty";
  };

  return (
    <div className="ds-page">
      <div className="ds-page__header">
        <div className="ds-page__header-left">
          <Database size={24} className="ds-page__icon" />
          <div>
            <h1 className="ds-page__title">Data Sources</h1>
            <p className="ds-page__subtitle">
              Manage TypeScript data sources for automated page sections
            </p>
          </div>
        </div>
        <div className="ds-page__header-actions">
          <div className="ds-page__view-toggle">
            <button
              className={`icon-btn icon-btn--lg ds-view-btn ${viewMode === "grid" ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() => toggleView("grid")}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`icon-btn icon-btn--lg ds-view-btn ${viewMode === "list" ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() => toggleView("list")}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
          <button
            className="ds-page__create-btn"
            onClick={() => navigate("/datasources/new")}
          >
            <Plus size={16} /> New Data Source
          </button>
        </div>
      </div>

      {dataSources.length > 0 && (
        <div className="ds-page__toolbar">
          <div className="ds-page__search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search data sources…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="ds-page__count">
            {filtered.length} data source{filtered.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </span>
        </div>
      )}

      {loading && (
        <div className="ds-page__loading">
          <div className="ds-skeleton" />
          <div className="ds-skeleton" />
          <div className="ds-skeleton" />
        </div>
      )}

      {!loading && dataSources.length === 0 && (
        <div className="ds-page__empty">
          <Database size={48} />
          <h3>No data sources yet</h3>
          <p>Create your first data source to power automated page sections.</p>
          <button
            className="ds-page__create-btn"
            onClick={() => navigate("/datasources/new")}
          >
            <Plus size={16} /> Create Data Source
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && viewMode === "grid" && (
        <div className="ds-grid">
          {filtered.map((ds) => (
            <Link
              key={ds.id}
              to={`/datasources/${ds.id}`}
              className="ds-card card card--interactive"
            >
              <div className="ds-card__header">
                <div className="ds-card__title-row">
                  <Zap size={16} className="ds-card__type-icon" />
                  <h3 className="ds-card__title">{ds.name}</h3>
                </div>
                <button
                  className="icon-btn icon-btn--sm icon-btn--danger ds-card__delete-btn"
                  onClick={(e) => handleDelete(e, ds.id)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {ds.description && (
                <p className="ds-card__desc">{ds.description}</p>
              )}

              <div className="ds-card__code-preview">
                <Code2 size={12} />
                <pre>{codePreview(ds.code)}</pre>
              </div>

              <div className="ds-card__meta">
                <div className="ds-card__meta-row">
                  <UserCircle2 size={12} />
                  <CreatorChip creator={ds.creator} />
                </div>
                <div className="ds-card__meta-row">
                  <Clock size={12} />
                  <span className="ds-meta-value">
                    {relativeTimeAgo(ds.updated_at)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && viewMode === "list" && (
        <div className="ds-list">
          <div className="ds-list__header">
            <span className="ds-list__col ds-list__col--name">Name</span>
            <span className="ds-list__col ds-list__col--desc">Description</span>
            <span className="ds-list__col ds-list__col--creator">Creator</span>
            <span className="ds-list__col ds-list__col--updated">Updated</span>
            <span className="ds-list__col ds-list__col--actions" />
          </div>
          {filtered.map((ds) => (
            <Link
              key={ds.id}
              to={`/datasources/${ds.id}`}
              className="ds-list__row"
            >
              <span className="ds-list__col ds-list__col--name">
                <Zap size={14} className="ds-card__type-icon" />
                {ds.name}
              </span>
              <span className="ds-list__col ds-list__col--desc">
                {ds.description || "—"}
              </span>
              <span className="ds-list__col ds-list__col--creator">
                <CreatorChip creator={ds.creator} />
              </span>
              <span className="ds-list__col ds-list__col--updated">
                {relativeTimeAgo(ds.updated_at)}
              </span>
              <span className="ds-list__col ds-list__col--actions">
                <button
                  className="icon-btn icon-btn--sm icon-btn--danger ds-card__delete-btn"
                  onClick={(e) => handleDelete(e, ds.id)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { customConfirm } from "../../components/ui/Prompt";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
 Database,
 Plus,
 Code2,
 Clock,
 UserCircle2,
 Trash2,
 Zap,
} from "lucide-react";
import { apiRequest } from "../../utils/api";
import UserAvatar from "../../components/user/UserAvatar";
import UserProfileOverlay from "../../components/user/UserProfileOverlay";

import { relativeTimeAgo } from "../../utils/serverTime";
import type { DataSource, DataSourceCreator } from "../../components/page/types";
import { toast } from "sonner";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
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
 if (!await customConfirm("Delete this data source?")) return;
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
 <UserProfileOverlay userId={creator.id} fallbackName={creator.display_name || creator.username} fallbackAvatar={creator.avatar_url || undefined}>
 <span className="ds-creator-chip">
 <span className="ds-creator-chip__avatar">
 <UserAvatar
 src={creator.avatar_url || undefined}
 alt={creator.display_name || creator.username}
 size={18}
 initials={(creator.display_name ||
 creator.username)?.[0]?.toUpperCase()}
 />
 </span>
 <span className="ds-creator-chip__name">
 {creator.display_name || creator.username}
 </span>
 </span>
 </UserProfileOverlay>
 );
 };

 const codePreview = (code: string) => {
 const lines = code
 .split("\n")
 .filter((l) => l.trim() && !l.trim().startsWith("//"));
 return lines.slice(0, 3).join("\n") || "// empty";
 };

 return (
 <DirectoryLayout
 className="ds-page"
 title={
 <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
 <Database size={24} className="ds-page__icon" style={{ color: "var(--primary-color)" }} />
 <span>Data Sources</span>
 </div>
 }
 subtitle="Manage TypeScript data sources for automated page sections"
 headerActions={
 <>
 <button
 className="btn btn-primary ds-page__create-btn"
 onClick={() => navigate("/datasources/new")}
 style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
 >
 <Plus size={16} /> New Data Source
 </button>
 </>
 }
 searchPlaceholder="Search data sources…"
 searchValue={search}
 onSearchChange={setSearch}
 metrics={[
 <span key="count" className="ds-page__count">
 {filtered.length} data source{filtered.length !== 1 ? "s" : ""}
 {search && ` matching "${search}"`}
 </span>
 ]}
 viewMode={viewMode}
 onViewModeChange={toggleView}
 items={loading ? [] : filtered}
 emptyState={
 loading ? (
 <div className="ds-page__loading">
 <div className="ds-skeleton" />
 <div className="ds-skeleton" />
 <div className="ds-skeleton" />
 </div>
 ) : dataSources.length === 0 ? (
 <div className="ds-page__empty">
 <Database size={48} />
 <h3>No data sources yet</h3>
 <p>Create your first data source to power automated page sections.</p>
 <button
 className="btn btn-primary"
 onClick={() => navigate("/datasources/new")}
 style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
 >
 <Plus size={16} /> Create Data Source
 </button>
 </div>
 ) : null
 }
 renderGridCard={(ds) => (
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
 className="action-btn danger ds-card__danger-btn"
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
 )}
 tableColumns={[
 {
 header: "Name",
 width: "minmax(200px, 2fr)",
 className: "table-view__cell--bold",
 cell: (ds) => (
 <>
 <Zap size={14} className="ds-card__type-icon" style={{ marginRight: '0.5rem' }} />
 {ds.name}
 </>
 ),
 },
 {
 header: "Description",
 width: "minmax(250px, 3fr)",
 className: "table-view__cell--muted",
 cell: (ds) => ds.description || "—",
 },
 {
 header: "Creator",
 width: "minmax(150px, 1.5fr)",
 cell: (ds) => <CreatorChip creator={ds.creator} />,
 },
 {
 header: "Updated",
 width: "minmax(120px, 1fr)",
 className: "table-view__cell--muted",
 cell: (ds) => relativeTimeAgo(ds.updated_at),
 },
 {
 header: "",
 width: "48px",
 className: "table-view__cell--actions",
 cell: (ds) => (
 <button
 className="action-btn danger ds-card__danger-btn"
 onClick={(e) => handleDelete(e, ds.id)}
 title="Delete"
 >
 <Trash2 size={14} />
 </button>
 ),
 },
 ]}
 renderRowWrapper={(ds, _, props, cells) => (
 <Link
 key={ds.id}
 to={`/datasources/${ds.id}`}
 {...props}
 >
 {cells}
 </Link>
 )}
 />
 );
}

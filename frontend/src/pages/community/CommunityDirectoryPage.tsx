import { useAtomValue } from "jotai";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { hasPermissionAtom, isAuthenticatedAtom } from "../../atoms/auth";
import Button from "../../components/input/Button";
import {
  DirectoryLayout,
  type ViewMode,
} from "../../components/page/layout/templates/DirectoryLayout";
import type { TableColumn } from "../../components/ui/TableView/TableView";
import { apiRequest } from "../../utils/api";
import { confirmDestructiveAction } from "../../components/ui/Prompt";
import { CommunityModuleShell } from "./CommunityModuleShell";
import "./community.css";

type Kind = "proposal" | "showcase" | "event";
interface Publication {
  id: number;
  kind: Kind;
  title: string;
  summary: string;
  author_name: string;
  created_at: string;
  can_edit?: boolean;
  can_delete?: boolean;
}
interface Page {
  items: Publication[];
  next_cursor?: number;
}

const labels: Record<Kind, string> = {
  proposal: "Proposals",
  showcase: "Showcases",
  event: "Events",
};

export default function CommunityDirectoryPage() {
  const raw = useParams().kind;
  const kind = (raw === "showcase" || raw === "event" ? raw : "proposal") as Kind;
  const [data, setData] = useState<Page>({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canCreate = isAuthenticated && (kind !== "event" || hasPermission("community.manage"));

  const load = async (cursor?: number) => {
    setLoading(true);
    setError("");
    try {
      const page = await apiRequest<Page>(
        `/community/${kind}?q=${encodeURIComponent(search)}${cursor ? `&cursor=${cursor}` : ""}`
      );
      const safePage = { ...page, items: Array.isArray(page?.items) ? page.items : [] };
      setData(old =>
        cursor
          ? { items: [...old.items, ...safePage.items], next_cursor: safePage.next_cursor }
          : safePage
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Community content unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [kind, search]);

  const columns: TableColumn<Publication>[] = [
    {
      id: "title",
      header: "Title",
      cell: value => <Link to={`/community/${value.kind}/${value.id}`}>{value.title}</Link>,
    },
    { id: "author", header: "By", cell: value => value.author_name },
    {
      id: "date",
      header: "Published",
      cell: value => new Date(value.created_at).toLocaleDateString(),
    },
    {
      id: "actions",
      header: "Actions",
      cell: value => controls(value),
    },
  ];

  async function remove(publication: Publication) {
    if (!(await confirmDestructiveAction({
      title: `Delete this ${publication.kind}?`,
      body: "The publication and its linked custom page will move to Trash together.",
      confirmLabel: `Delete ${publication.kind}`,
    }))) return;
    try {
      await apiRequest(`/community/${publication.kind}/${publication.id}`, { method: "DELETE" });
      setData(current => ({ ...current, items: current.items.filter(item => item.id !== publication.id) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Deletion failed");
    }
  }

  function controls(publication: Publication, overlay = false) {
    if (!publication.can_edit && !publication.can_delete) return null;
    return (
      <div className={`community-card__actions${overlay ? " community-card__actions--overlay" : ""}`}>
        {publication.can_edit && (
          <Link
            className="action-btn edit-btn"
            to={`/form/community/${publication.kind}/${publication.id}/edit`}
            title={`Edit ${publication.kind}`}
            aria-label={`Edit ${publication.kind}`}
          >
            <Pencil size={14} />
          </Link>
        )}
        {publication.can_delete && (
          <Button
            unstyled
            className="action-btn danger"
            title={`Delete ${publication.kind}`}
            aria-label={`Delete ${publication.kind}`}
            onClick={() => void remove(publication)}
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <CommunityModuleShell className="community-directory-shell">
      <DirectoryLayout
        className="community-directory"
        title={labels[kind]}
        subtitle="Community-created work with dedicated lifecycle and moderation."
        searchValue={search}
        onSearchChange={setSearch}
        viewMode={view}
        onViewModeChange={setView}
        headerActions={canCreate ? (
          <Link
            className="action-btn"
            to={`/form/community/${kind}/new`}
            title={`Create ${kind}`}
            aria-label={`Create ${kind}`}
          >
            <Plus size={15} />
          </Link>
        ) : undefined}
        items={data.items}
        tableColumns={columns}
        tableRowKey={value => value.id}
        renderGridCard={value => (
          <article key={value.id} className="community-card">
            <span>{value.kind}</span>
            <h2><Link to={`/community/${value.kind}/${value.id}`}>{value.title}</Link></h2>
            <p>{value.summary || "No summary provided."}</p>
            <small>By {value.author_name}</small>
            {controls(value, true)}
          </article>
        )}
        emptyState={
          <p>
            {loading
              ? "Loading community content…"
              : `No ${labels[kind].toLowerCase()} match this view.`}
          </p>
        }
      />
      {error && (
        <p role="alert" className="community-error community-module-state">
          {error}
        </p>
      )}
      {data.next_cursor && (
        <div className="community-module-state">
          <Button loading={loading} onClick={() => void load(data.next_cursor)}>
            Load more
          </Button>
        </div>
      )}
    </CommunityModuleShell>
  );
}

import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Button from "../../components/input/Button";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
import { customConfirm } from "../../components/ui/Prompt";
import { type TableColumn, TableView } from "../../components/ui/TableView/TableView";
import { apiRequest } from "../../utils/api";
import "./TrashPage.css";

interface TrashItem {
  resource: string;
  id: string;
  label: string;
  detail?: string;
  deleted_at: string;
  deleted_by?: number;
}

interface TrashGroup {
  resource: string;
  label: string;
  items: TrashItem[];
  has_more: boolean;
}

interface TrashResponse {
  groups: TrashGroup[];
}

const PAGE_SIZE = 25;

export default function TrashPage() {
  const [groups, setGroups] = useState<TrashGroup[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<TrashResponse>(`/trash?limit=${PAGE_SIZE}&offset=0`);
      setGroups(response.groups ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Trash");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTrash();
    const refresh = () => void fetchTrash();
    window.addEventListener("trash:updated", refresh);
    return () => window.removeEventListener("trash:updated", refresh);
  }, []);

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return groups.map(group => ({
      ...group,
      items: group.items.filter(item =>
        `${item.label} ${item.detail ?? ""}`.toLowerCase().includes(query)
      ),
    }));
  }, [groups, search]);

  const allItems = visibleGroups.flatMap(group => group.items);

  const restore = async (item: TrashItem) => {
    const confirmed = await customConfirm({
      title: `Restore ${item.label}?`,
      body: "Undoing this deletion makes the resource visible again. A deleted parent or reused unique name can prevent restoration.",
      confirmLabel: "Restore",
    });
    if (!confirmed) return;

    const key = `${item.resource}:${item.id}`;
    setRestoring(key);
    try {
      await apiRequest(
        `/trash/${encodeURIComponent(item.resource)}/${encodeURIComponent(item.id)}/restore`,
        { method: "POST" }
      );
      setGroups(current =>
        current.map(group =>
          group.resource === item.resource
            ? { ...group, items: group.items.filter(row => row.id !== item.id) }
            : group
        )
      );
      toast.success(`${item.label} restored`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setRestoring(null);
    }
  };

  const loadMore = async (group: TrashGroup) => {
    setLoadingMore(group.resource);
    try {
      const next = await apiRequest<TrashGroup>(
        `/trash/${encodeURIComponent(group.resource)}?limit=${PAGE_SIZE}&offset=${group.items.length}`
      );
      setGroups(current =>
        current.map(existing =>
          existing.resource === group.resource
            ? {
                ...existing,
                items: [...existing.items, ...(next.items ?? [])],
                has_more: next.has_more,
              }
            : existing
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load more items");
    } finally {
      setLoadingMore(null);
    }
  };

  const columns: TableColumn<TrashItem>[] = [
    {
      id: "name",
      header: "Name",
      width: "minmax(12rem, 2fr)",
      className: "table-view__cell--bold",
      cell: item => item.label,
    },
    {
      id: "detail",
      header: "Resource",
      width: "minmax(9rem, 1fr)",
      className: "table-view__cell--muted",
      cell: item => item.detail || item.resource.replaceAll("_", " "),
    },
    {
      id: "deleted",
      header: "Deleted",
      width: "minmax(10rem, 1fr)",
      className: "table-view__cell--muted",
      cell: item => new Date(item.deleted_at).toLocaleString(),
    },
    {
      id: "actions",
      header: "Actions",
      width: "8rem",
      className: "table-view__cell--actions",
      cell: item => {
        const key = `${item.resource}:${item.id}`;
        return (
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<RotateCcw size={14} />}
            loading={restoring === key}
            disabled={restoring !== null}
            onClick={() => void restore(item)}
            aria-label={`Restore ${item.label}`}
          >
            Undo
          </Button>
        );
      },
    },
  ];

  return (
    <DirectoryLayout
      className="trash-directory"
      title="Trash"
      subtitle="Review and restore resources you own or are authorized to manage."
      searchPlaceholder="Search deleted resources..."
      searchValue={search}
      onSearchChange={setSearch}
      metrics={[
        <span key="items">{allItems.length} deleted resources</span>,
        <span key="groups">
          {visibleGroups.filter(group => group.items.length > 0).length} groups
        </span>,
      ]}
      headerActions={
        <Button size="sm" variant="secondary" onClick={() => void fetchTrash()} loading={loading}>
          Refresh
        </Button>
      }
      items={allItems}
      viewMode="list"
      renderGridCard={() => null}
      customListContent={
        <div className="trash-groups" aria-live="polite">
          {loading ? (
            <div className="trash-directory__state">Loading Trash…</div>
          ) : visibleGroups.every(group => group.items.length === 0) ? (
            <div className="trash-directory__state">
              <Trash2 size={30} aria-hidden="true" />
              <p>{search ? "No deleted resources match your search." : "Trash is empty."}</p>
            </div>
          ) : (
            visibleGroups.map(group =>
              group.items.length === 0 ? null : (
                <section
                  className="trash-group"
                  key={group.resource}
                  aria-labelledby={`trash-${group.resource}`}
                >
                  <div className="trash-group__heading">
                    <div>
                      <h2 id={`trash-${group.resource}`}>{group.label}</h2>
                      <span>{group.items.length} loaded</span>
                    </div>
                    {group.has_more && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={loadingMore === group.resource}
                        disabled={loadingMore !== null}
                        onClick={() => void loadMore(group)}
                      >
                        Load more
                      </Button>
                    )}
                  </div>
                  <TableView
                    data={group.items}
                    columns={columns}
                    rowKey={item => `${item.resource}:${item.id}`}
                    chrome="embedded"
                    lazyRows={false}
                  />
                </section>
              )
            )
          )}
        </div>
      }
      emptyState={null}
    />
  );
}

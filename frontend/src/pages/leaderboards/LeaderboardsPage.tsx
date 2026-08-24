import { useEffect, useMemo, useState } from "react";
import Button from "../../components/input/Button";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
import type { TableColumn } from "../../components/ui/TableView/TableView";
import { apiRequest } from "../../utils/api";
import "./leaderboards.css";
interface Dataset {
  key: string;
  name: string;
  description: string;
  metric_label: string;
  direction: string;
  tie_rule: string;
}
interface Season {
  key: string;
  name: string;
  closed_at?: string;
}
interface Entry {
  id: number;
  rank: number;
  subject_type: string;
  subject_key?: string;
  display_name: string;
  score: string;
}
interface Standings {
  dataset: Dataset;
  season: Season;
  entries: Entry[];
  next_cursor?: string;
}
export default function LeaderboardsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataset, setDataset] = useState("");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState("");
  const [data, setData] = useState<Standings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    apiRequest<Dataset[] | null>("/rankings/datasets")
      .then(v => {
        const items = Array.isArray(v) ? v : [];
        setDatasets(items);
        setDataset(items[0]?.key ?? "");
      })
      .catch(e => setError(e instanceof Error ? e.message : "Rankings unavailable"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!dataset) {
      setSeasons([]);
      setSeason("");
      return;
    }
    setLoading(true);
    apiRequest<Season[] | null>(`/rankings/${dataset}/seasons`)
      .then(v => {
        const items = Array.isArray(v) ? v : [];
        setSeasons(items);
        setSeason(items[0]?.key ?? "");
      })
      .catch(e => setError(e instanceof Error ? e.message : "Seasons unavailable"))
      .finally(() => setLoading(false));
  }, [dataset]);
  useEffect(() => {
    if (!dataset || !season) {
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    apiRequest<Standings>(`/rankings/${dataset}/seasons/${season}`)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Standings unavailable"))
      .finally(() => setLoading(false));
  }, [dataset, season]);
  const loadMore = async () => {
    if (!data?.next_cursor) return;
    setLoading(true);
    try {
      const next = await apiRequest<Standings>(
        `/rankings/${dataset}/seasons/${season}?cursor=${encodeURIComponent(data.next_cursor)}`
      );
      setData({ ...next, entries: [...data.entries, ...next.entries] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "More standings unavailable");
    } finally {
      setLoading(false);
    }
  };
  const entries = useMemo(
    () =>
      data?.entries.filter(v => v.display_name.toLowerCase().includes(search.toLowerCase())) ?? [],
    [data, search]
  );
  const columns: TableColumn<Entry>[] = [
    { id: "rank", header: "Rank", width: "5rem", cell: v => `#${v.rank}` },
    { id: "subject", header: "Participant", cell: v => <span>{v.display_name}</span> },
    { id: "score", header: data?.dataset.metric_label ?? "Score", cell: v => v.score },
  ];
  return (
    <ModulePageShell backTo="/community" backLabel="Back to Community" width="wide">
      <main className="leaderboards-page">
        <DirectoryLayout
          title="Leaderboards"
          subtitle="Season standings with deterministic ties."
          searchValue={search}
          onSearchChange={setSearch}
          headerActions={
            <div className="leaderboard-filters">
              <label>
                Dataset
                <select value={dataset} onChange={e => setDataset(e.target.value)}>
                  {datasets.map(v => (
                    <option key={v.key} value={v.key}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Season
                <select value={season} onChange={e => setSeason(e.target.value)}>
                  {seasons.map(v => (
                    <option key={v.key} value={v.key}>
                      {v.name}
                      {v.closed_at ? " (closed)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
          items={entries}
          renderGridCard={v => (
            <article key={v.id} className="leaderboard-card">
              <strong>#{v.rank}</strong>
              <span>{v.display_name}</span>
              <b>
                {v.score} {data?.dataset.metric_label}
              </b>
            </article>
          )}
          tableColumns={columns}
          tableRowKey={v => v.id}
          viewMode="list"
          emptyState={
            <p>
              {loading
                ? "Loading standings…"
                : datasets.length === 0
                  ? "No leaderboards are published."
                  : seasons.length === 0
                    ? "No seasons are available."
                    : "No participants match this view."}
            </p>
          }
        />
        {error && (
          <p className="leaderboard-error" role="alert">
            {error}
          </p>
        )}
        {data?.next_cursor && (
          <Button loading={loading} onClick={() => void loadMore()}>
            Load more
          </Button>
        )}
      </main>
    </ModulePageShell>
  );
}

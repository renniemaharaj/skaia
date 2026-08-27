import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import {
  DirectoryLayout,
  type ViewMode,
} from "../../components/page/layout/templates/DirectoryLayout";
import type { TableColumn } from "../../components/ui/TableView/TableView";
import { apiRequest } from "../../utils/api";
import "./rewards.css";

interface Reward {
  id: number;
  key: string;
  name: string;
  description: string;
  cost: number;
}
interface Grant {
  id: number;
  event_type: string;
  points: number;
  created_at: string;
}
interface Redemption {
  id: number;
  reward_name: string;
  cost: number;
  status: string;
  created_at: string;
}
interface Account {
  balance: number;
  grants: Grant[];
  redemptions: Redemption[];
}

function normalizeAccount(value: Partial<Account> | null | undefined): Account {
  return {
    balance: typeof value?.balance === "number" ? value.balance : 0,
    grants: Array.isArray(value?.grants) ? value.grants : [],
    redemptions: Array.isArray(value?.redemptions) ? value.redemptions : [],
  };
}

export default function RewardsPage({ operator = false }: { operator?: boolean }) {
  const [catalog, setCatalog] = useState<Reward[]>([]);
  const [account, setAccount] = useState<Account>({ balance: 0, grants: [], redemptions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, own] = await Promise.all([
        apiRequest<Reward[] | null>("/rewards/catalog"),
        apiRequest<Partial<Account> | null>("/rewards/account"),
      ]);
      setCatalog(Array.isArray(items) ? items : []);
      setAccount(normalizeAccount(own));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rewards are unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const redeem = async (id: number) => {
    setBusy(id);
    setError("");
    try {
      await apiRequest(`/rewards/redeem/${id}`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Redemption failed");
    } finally {
      setBusy(null);
    }
  };
  const filtered = catalog.filter(v =>
    (v.name + " " + v.description).toLowerCase().includes(search.toLowerCase())
  );
  const columns: TableColumn<Reward>[] = [
    {
      id: "name",
      header: "Reward",
      cell: v => (
        <>
          <strong>{v.name}</strong>
          <span>{v.description}</span>
        </>
      ),
    },
    { id: "cost", header: "Points", cell: v => v.cost },
    {
      id: "action",
      header: "",
      cell: v => (
        <Button
          size="sm"
          disabled={account.balance < v.cost}
          loading={busy === v.id}
          onClick={() => void redeem(v.id)}
        >
          Redeem
        </Button>
      ),
    },
  ];
  if (loading)
    return (
      <ModulePageShell backTo="/community" backLabel="Back to Community" width="wide">
        <main className="rewards-page" aria-busy="true">
          <p role="status">Loading rewards…</p>
        </main>
      </ModulePageShell>
    );
  return (
    <ModulePageShell backTo="/community" backLabel="Back to Community" width="wide">
      <main className="rewards-page">
        <DirectoryLayout
          title={operator ? "Reward operations" : "Rewards"}
          subtitle={
            operator
              ? "Review the catalog and delivery outcomes."
              : `${account.balance} points available`
          }
          searchValue={search}
          onSearchChange={setSearch}
          viewMode={view}
          onViewModeChange={setView}
          items={filtered}
          tableColumns={columns}
          tableRowKey={v => v.id}
          renderGridCard={v => (
            <article key={v.id} className="reward-card">
              <div>
                <h2>{v.name}</h2>
                <p>{v.description || "No description provided."}</p>
              </div>
              <footer>
                <strong>{v.cost} points</strong>
                <Button
                  size="sm"
                  disabled={account.balance < v.cost}
                  loading={busy === v.id}
                  onClick={() => void redeem(v.id)}
                >
                  Redeem
                </Button>
              </footer>
            </article>
          )}
          emptyState={<p>No rewards match this view.</p>}
        />
        {error && (
          <div className="rewards-message rewards-message--error" role="alert">
            <span>{error}</span>
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}
        <section className="rewards-history" aria-labelledby="reward-history-title">
          <h2 id="reward-history-title">Activity</h2>
          {account.grants.length === 0 && account.redemptions.length === 0 ? (
            <p>No reward activity yet.</p>
          ) : (
            <ul>
              {account.redemptions.map(v => (
                <li key={`r-${v.id}`}>
                  <span>{v.reward_name}</span>
                  <span>
                    {v.cost} points · {v.status}
                  </span>
                </li>
              ))}
              {account.grants.map(v => (
                <li key={`g-${v.id}`}>
                  <span>{v.event_type}</span>
                  <span>+{v.points} points</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </ModulePageShell>
  );
}

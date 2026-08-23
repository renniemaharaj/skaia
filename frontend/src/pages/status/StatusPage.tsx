import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { layoutModeAtom } from "../../atoms/layoutMode";
import Button from "../../components/input/Button";
import Select from "../../components/input/Select";
import { apiRequest } from "../../utils/api";
import "./status.css";

type ServiceState = "operational" | "degraded" | "unavailable" | "stale";

interface ComponentState {
  name: string;
  state: ServiceState;
  required: boolean;
  checked_at: string;
  latency_ms?: number;
  reason_code?: string;
}

interface Incident {
  id: number;
  title: string;
  summary: string;
  state: "investigating" | "monitoring" | "resolved" | "maintenance" | "draft";
  severity: "minor" | "major" | "critical" | "maintenance";
  component: "database" | "cache" | "web" | "platform";
  started_at: string;
  resolved_at?: string;
  updated_at: string;
}

interface StatusSnapshot {
  state: ServiceState;
  components: ComponentState[];
  incidents: Incident[];
  updated_at: string;
  delayed: boolean;
}

interface Diagnostics {
  state: ServiceState;
  components: ComponentState[];
  updated_at: string;
  runtime: {
    db_open_connections: number;
    db_in_use_connections: number;
    db_max_open_connections: number;
    db_wait_count: number;
    fulfilment_queue_ready: number;
    fulfilment_queue_oldest_seconds: number;
  };
}

const stateLabel: Record<ServiceState, string> = {
  operational: "All systems operational",
  degraded: "Some systems degraded",
  unavailable: "Service interruption",
  stale: "Status data delayed",
};

const iconFor = (state: ServiceState) => {
  if (state === "operational") return <CheckCircle2 aria-hidden="true" />;
  if (state === "stale") return <Clock3 aria-hidden="true" />;
  return <AlertTriangle aria-hidden="true" />;
};

export default function StatusPage({ operator = false }: { operator?: boolean }) {
  const setLayoutMode = useSetAtom(layoutModeAtom);
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const publicSnapshot = await apiRequest<StatusSnapshot>("/status/");
      setSnapshot(publicSnapshot);
      if (operator) {
        setDiagnostics(await apiRequest<Diagnostics>("/status/diagnostics"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status is temporarily unavailable");
    } finally {
      setLoading(false);
    }
  }, [operator]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createIncident(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest("/status/incidents", {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          summary: data.get("summary"),
          state: data.get("state"),
          severity: data.get("severity"),
          component: data.get("component"),
          started_at: new Date().toISOString(),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not publish incident");
    } finally {
      setSaving(false);
    }
  }

  async function resolveIncident(incident: Incident) {
    setSaving(true);
    setFormError("");
    try {
      await apiRequest(`/status/incidents/${incident.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...incident, state: "resolved" }),
      });
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not resolve incident");
    } finally {
      setSaving(false);
    }
  }

  const effectiveState = snapshot?.delayed ? "stale" : snapshot?.state;

  return (
    <main className="service-status" aria-busy={loading}>
      <header className="service-status__header">
        <div>
          <p className="service-status__eyebrow">{operator ? "Operator diagnostics" : "Service status"}</p>
          <h1>{operator ? "Platform health" : "Current availability"}</h1>
          <p>Dependency health and customer-facing incident updates.</p>
        </div>
        <Button type="button" onClick={() => void load()} loading={loading} iconLeft={<RefreshCw size={15} aria-hidden="true" />}>Refresh</Button>
      </header>

      {loading && !snapshot ? (
        <div className="card service-status__notice" role="status">Checking current service health…</div>
      ) : error ? (
        <div className="card service-status__notice service-status__notice--error" role="alert">
          <ShieldAlert aria-hidden="true" />
          <div><strong>Status unavailable</strong><p>{error}</p></div>
        </div>
      ) : snapshot && effectiveState ? (
        <>
          <section className={`card service-status__summary service-status--${effectiveState}`} aria-live="polite">
            {iconFor(effectiveState)}
            <div><h2>{stateLabel[effectiveState]}</h2><p>Updated {new Date(snapshot.updated_at).toLocaleString()}</p></div>
          </section>

          <section aria-labelledby="components-heading">
            <h2 id="components-heading">Components</h2>
            <div className="service-status__components">
              {(operator && diagnostics ? diagnostics.components : snapshot.components).map(component => (
                <article className="card service-status__component" key={component.name}>
                  <div>{iconFor(component.state)}<strong>{component.name}</strong></div>
                  <span className={`service-status__badge service-status--${component.state}`}>{component.state}</span>
                  {operator && component.latency_ms !== undefined && (
                    <p>{component.latency_ms} ms{component.reason_code ? ` · ${component.reason_code.replaceAll("_", " ")}` : ""}</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="incidents-heading">
            <h2 id="incidents-heading">Incidents and maintenance</h2>
            {snapshot.incidents.length === 0 ? (
              <div className="card service-status__empty"><Activity aria-hidden="true" /><p>No incidents have been published.</p></div>
            ) : (
              <div className="service-status__incidents">
                {snapshot.incidents.map(incident => (
                  <article className="card" key={incident.id}>
                    <div><h3>{incident.title}</h3><span>{incident.state}</span></div>
                    <p>{incident.summary || "No additional details."}</p>
                    <small>{incident.component} · Updated {new Date(incident.updated_at).toLocaleString()}</small>
                    {operator && incident.state !== "resolved" && <Button type="button" size="sm" onClick={() => void resolveIncident(incident)} disabled={saving}>Mark resolved</Button>}
                  </article>
                ))}
              </div>
            )}
          </section>

          {operator && diagnostics?.runtime && (
            <section aria-labelledby="runtime-heading">
              <h2 id="runtime-heading">Capacity and queue</h2>
              <div className="service-status__components">
                <article className="card service-status__component"><strong>Database pool</strong><p>{diagnostics.runtime.db_in_use_connections} in use · {diagnostics.runtime.db_open_connections} open · {diagnostics.runtime.db_max_open_connections} max</p></article>
                <article className="card service-status__component"><strong>Pool waits</strong><p>{diagnostics.runtime.db_wait_count} waits since process start</p></article>
                <article className="card service-status__component"><strong>Fulfilment queue</strong><p>{diagnostics.runtime.fulfilment_queue_ready} ready · oldest {diagnostics.runtime.fulfilment_queue_oldest_seconds}s</p></article>
              </div>
            </section>
          )}

          {operator && <IncidentForm saving={saving} error={formError} onSubmit={createIncident} />}
        </>
      ) : null}
    </main>
  );
}

function IncidentForm({ saving, error, onSubmit }: { saving: boolean; error: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="card service-status__operator" aria-labelledby="publish-incident-heading">
      <h2 id="publish-incident-heading">Publish an update</h2>
      <form onSubmit={onSubmit}>
        <label>Title<input name="title" minLength={3} maxLength={120} required /></label>
        <label>Summary<textarea name="summary" maxLength={1000} rows={4} /></label>
        <div className="service-status__form-grid">
          <Select name="state" label="State" defaultValue="investigating" block options={[{ value: "investigating", label: "Investigating" }, { value: "monitoring", label: "Monitoring" }, { value: "maintenance", label: "Maintenance" }, { value: "resolved", label: "Resolved" }, { value: "draft", label: "Draft" }]} />
          <Select name="severity" label="Severity" defaultValue="minor" block options={[{ value: "minor", label: "Minor" }, { value: "major", label: "Major" }, { value: "critical", label: "Critical" }, { value: "maintenance", label: "Maintenance" }]} />
          <Select name="component" label="Component" defaultValue="platform" block options={[{ value: "platform", label: "Platform" }, { value: "web", label: "Web" }, { value: "database", label: "Database" }, { value: "cache", label: "Cache" }]} />
        </div>
        {error && <p className="service-status__form-error" role="alert">{error}</p>}
        <Button type="submit" loading={saving}>Publish update</Button>
      </form>
    </section>
  );
}

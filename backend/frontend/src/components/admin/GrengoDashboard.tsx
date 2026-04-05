import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import MonacoEditor from "../monaco/Editor";
import "./GrengoDashboard.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface SiteInfo {
  name: string;
  port: string;
  status: string;
  running: boolean;
  armed: boolean;
  domains: string[];
  db_name: string;
  features: string;
}

interface CreateSiteParams {
  name: string;
  port: string;
  domains: string[];
  db_name: string;
  admin_password: string;
  admin_email: string;
  session_timeout: string;
  environment: string;
  features: string;
}

interface ContainerStats {
  name: string;
  cpu_percent: number;
  mem_usage: string;
  mem_limit: string;
  mem_percent: number;
  net_io: string;
  block_io: string;
  pids: number;
}

interface SiteStorageInfo {
  name: string;
  used: number;
  used_human: string;
}

interface StorageInfo {
  sites: SiteStorageInfo[];
  total_used: number;
  total_limit: number;
  total_percent: number;
  total_used_human: string;
  total_limit_human: string;
}

interface SysInfo {
  server_time: string;
  cpu_model?: string;
  cpu_cores?: number;
  uptime_seconds?: number;
  uptime_human?: string;
  mem_total?: string;
  load_avg?: string;
}

interface MigrateResult {
  ok: boolean;
  output: string;
  exit_code: number;
}

const DEFAULT_FEATURES = "landing,store,forum,cart,users,inbox,presence";

// Keep-alive interval: ping every 2 minutes to reset the 10-minute inactivity timer.
const KEEPALIVE_MS = 2 * 60 * 1000;

// ── Component ──────────────────────────────────────────────────────────────

export default function GrengoDashboard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // Session validation state.
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  // Dashboard state.
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Panels.
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Busy state per-site for actions.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Performance metrics.
  const [stats, setStats] = useState<ContainerStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // Storage info.
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  // System info.
  const [sysInfo, setSysInfo] = useState<SysInfo | null>(null);

  // Compose / migrate state.
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeOutput, setComposeOutput] = useState("");
  const [migrateBusy, setMigrateBusy] = useState<Record<string, boolean>>({});
  const [migrateOutput, setMigrateOutput] = useState<Record<string, string>>(
    {},
  );
  const [migrateAllBusy, setMigrateAllBusy] = useState(false);
  const [migrateAllOutput, setMigrateAllOutput] = useState("");

  // Node export/import.
  const [showImportNode, setShowImportNode] = useState(false);
  const [nodeExportBusy, setNodeExportBusy] = useState(false);

  // Env editor.
  const [envSite, setEnvSite] = useState<string | null>(null);
  const [envContent, setEnvContent] = useState("");
  const [envDraft, setEnvDraft] = useState("");
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState("");

  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Session-scoped API helper ────────────────────────────────────────

  const apiBase = `/grengo/s/${sessionId}`;

  const grengoRequest = useCallback(
    async <T,>(endpoint: string, opts: RequestInit = {}): Promise<T> => {
      return apiRequest<T>(`${apiBase}${endpoint}`, opts);
    },
    [apiBase],
  );

  // ── Session validation & keep-alive ──────────────────────────────────

  const validateSession = useCallback(async () => {
    if (!sessionId) {
      setSessionValid(false);
      return false;
    }
    try {
      const res = await apiRequest<{ valid?: boolean }>(`${apiBase}/validate`);
      if (res?.valid) {
        setSessionValid(true);
        return true;
      }
    } catch {
      // session expired or invalid
    }
    setSessionValid(false);
    return false;
  }, [sessionId, apiBase]);

  // Validate on mount.
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  // Redirect to home when session becomes invalid.
  useEffect(() => {
    if (sessionValid === false) {
      navigate("/", { replace: true });
    }
  }, [sessionValid, navigate]);

  // Keep-alive interval.
  useEffect(() => {
    if (sessionValid) {
      keepAliveRef.current = setInterval(async () => {
        const ok = await validateSession();
        if (!ok) navigate("/", { replace: true });
      }, KEEPALIVE_MS);
    }
    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    };
  }, [sessionValid, validateSession, navigate]);

  // ── Lock / end session ───────────────────────────────────────────────

  const handleLock = async () => {
    try {
      await apiRequest(`${apiBase}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    navigate("/", { replace: true });
  };

  // ── Fetch sites ──────────────────────────────────────────────────────

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await grengoRequest<SiteInfo[]>("/sites");
      setSites(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sites");
    } finally {
      setLoading(false);
    }
  }, [grengoRequest]);

  useEffect(() => {
    if (sessionValid) fetchSites();
  }, [sessionValid, fetchSites]);

  // ── Fetch stats ──────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await grengoRequest<ContainerStats[]>("/stats");
      setStats(Array.isArray(data) ? data : []);
    } catch {
      // non-critical — silently fail
    } finally {
      setStatsLoading(false);
    }
  }, [grengoRequest]);

  useEffect(() => {
    if (sessionValid) fetchStats();
  }, [sessionValid, fetchStats]);

  // ── Fetch storage ────────────────────────────────────────────────────

  const fetchStorage = useCallback(async () => {
    try {
      const data = await grengoRequest<StorageInfo>("/storage");
      setStorage(data ?? null);
    } catch {
      // non-critical
    }
  }, [grengoRequest]);

  useEffect(() => {
    if (sessionValid) fetchStorage();
  }, [sessionValid, fetchStorage]);

  // ── Fetch sysinfo ────────────────────────────────────────────────────

  const fetchSysInfo = useCallback(async () => {
    try {
      const data = await grengoRequest<SysInfo>("/sysinfo");
      setSysInfo(data ?? null);
    } catch {
      // non-critical
    }
  }, [grengoRequest]);

  useEffect(() => {
    if (sessionValid) fetchSysInfo();
  }, [sessionValid, fetchSysInfo]);

  // ── Compose actions ──────────────────────────────────────────────────

  const handleComposeUp = async (build: boolean) => {
    setComposeBusy(true);
    setComposeOutput("");
    try {
      await grengoRequest("/compose/up", {
        method: "POST",
        body: JSON.stringify({ build }),
      });
      setComposeOutput(
        build ? "compose up --build completed" : "compose up completed",
      );
      await fetchSites();
      await fetchStats();
    } catch (e: unknown) {
      setComposeOutput(e instanceof Error ? e.message : "Compose up failed");
    } finally {
      setComposeBusy(false);
    }
  };

  const handleComposeDown = async () => {
    setComposeBusy(true);
    setComposeOutput("");
    try {
      await grengoRequest("/compose/down", { method: "POST" });
      setComposeOutput("compose down completed");
      await fetchSites();
      await fetchStats();
    } catch (e: unknown) {
      setComposeOutput(e instanceof Error ? e.message : "Compose down failed");
    } finally {
      setComposeBusy(false);
    }
  };

  // ── Migrate actions ──────────────────────────────────────────────────

  const handleMigrate = async (name: string, rebuild = false) => {
    setMigrateBusy((prev) => ({ ...prev, [name]: true }));
    setMigrateOutput((prev) => ({ ...prev, [name]: "" }));
    try {
      const result = await grengoRequest<MigrateResult>(
        `/sites/${name}/migrate`,
        {
          method: "POST",
          body: JSON.stringify({ rebuild }),
        },
      );
      setMigrateOutput((prev) => ({
        ...prev,
        [name]: result.ok
          ? "Migration completed successfully"
          : `Migration failed (exit ${result.exit_code}):\n${result.output}`,
      }));
    } catch (e: unknown) {
      setMigrateOutput((prev) => ({
        ...prev,
        [name]: e instanceof Error ? e.message : "Migration failed",
      }));
    } finally {
      setMigrateBusy((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleMigrateAll = async (rebuild = false) => {
    setMigrateAllBusy(true);
    setMigrateAllOutput("");
    try {
      const result = await grengoRequest<MigrateResult>("/migrate-all", {
        method: "POST",
        body: JSON.stringify({ rebuild }),
      });
      setMigrateAllOutput(
        result.ok
          ? "All migrations completed successfully"
          : `Migration failed (exit ${result.exit_code}):\n${result.output}`,
      );
    } catch (e: unknown) {
      setMigrateAllOutput(
        e instanceof Error ? e.message : "Migrate all failed",
      );
    } finally {
      setMigrateAllBusy(false);
    }
  };

  // ── Node export / import ─────────────────────────────────────────────

  const handleExportNode = async () => {
    setNodeExportBusy(true);
    try {
      const token = localStorage.getItem("auth.accessToken");
      const res = await fetch(`/api${apiBase}/export-node`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] || `grengo-node-export.tar.gz`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Node export failed");
    } finally {
      setNodeExportBusy(false);
    }
  };

  // ── Site actions ─────────────────────────────────────────────────────

  const siteAction = async (
    name: string,
    action: string,
    method: string = "POST",
  ) => {
    setBusy((prev) => ({ ...prev, [name]: true }));
    try {
      await grengoRequest(`/sites/${name}/${action}`, { method });
      await fetchSites();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Permanently delete site "${name}" and all its data?`)) return;
    setBusy((prev) => ({ ...prev, [name]: true }));
    try {
      await grengoRequest(`/sites/${name}`, { method: "DELETE" });
      await fetchSites();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleExport = async (name: string) => {
    setBusy((prev) => ({ ...prev, [name]: true }));
    try {
      const token = localStorage.getItem("auth.accessToken");
      const res = await fetch(`/api${apiBase}/sites/${name}/export`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] || `${name}-export.tar.gz`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy((prev) => ({ ...prev, [name]: false }));
    }
  };

  // ── Env editor ───────────────────────────────────────────────────────

  const openEnvEditor = async (name: string) => {
    setEnvSite(name);
    setEnvLoading(true);
    setEnvError("");
    try {
      const data = await grengoRequest<{ content: string }>(
        `/sites/${name}/env`,
      );
      setEnvContent(data.content);
      setEnvDraft(data.content);
    } catch (e: unknown) {
      setEnvError(e instanceof Error ? e.message : "Failed to load .env");
    } finally {
      setEnvLoading(false);
    }
  };

  const closeEnvEditor = () => {
    setEnvSite(null);
    setEnvContent("");
    setEnvDraft("");
    setEnvError("");
  };

  const saveEnv = async () => {
    if (!envSite) return;
    setEnvSaving(true);
    setEnvError("");
    try {
      await grengoRequest(`/sites/${envSite}/env`, {
        method: "PUT",
        body: JSON.stringify({ content: envDraft }),
      });
      setEnvContent(envDraft);
    } catch (e: unknown) {
      setEnvError(e instanceof Error ? e.message : "Failed to save .env");
    } finally {
      setEnvSaving(false);
    }
  };

  const envDirty = envDraft !== envContent;

  // ── Render: Loading / validating ──────────────────────────────────────

  if (sessionValid === null) {
    return (
      <div className="grengo-gate">
        <p>Validating session…</p>
      </div>
    );
  }

  // ── Render: Dashboard ────────────────────────────────────────────────

  return (
    <div className="grengo-dashboard">
      <h1>Grengo Dashboard</h1>

      {/* System Info Bar */}
      {sysInfo && (
        <div className="grengo-sysinfo">
          <div className="sysinfo-item">
            <span className="sysinfo-label">Server Time</span>
            <span className="sysinfo-value">
              {new Date(sysInfo.server_time).toLocaleString()}
            </span>
          </div>
          {sysInfo.cpu_model && (
            <div className="sysinfo-item">
              <span className="sysinfo-label">CPU</span>
              <span className="sysinfo-value">
                {sysInfo.cpu_model} ({sysInfo.cpu_cores} cores)
              </span>
            </div>
          )}
          {sysInfo.mem_total && (
            <div className="sysinfo-item">
              <span className="sysinfo-label">Memory</span>
              <span className="sysinfo-value">{sysInfo.mem_total}</span>
            </div>
          )}
          {sysInfo.uptime_human && (
            <div className="sysinfo-item">
              <span className="sysinfo-label">Uptime</span>
              <span className="sysinfo-value">{sysInfo.uptime_human}</span>
            </div>
          )}
          {sysInfo.load_avg && (
            <div className="sysinfo-item">
              <span className="sysinfo-label">Load</span>
              <span className="sysinfo-value">{sysInfo.load_avg}</span>
            </div>
          )}
        </div>
      )}

      <div className="grengo-lock-bar">
        <button className="btn" onClick={handleLock}>
          End Session
        </button>
      </div>

      {/* Toolbar */}
      <div className="grengo-toolbar">
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowCreate(!showCreate);
            setShowImport(false);
            setShowImportNode(false);
          }}
        >
          {showCreate ? "Cancel" : "+ New Site"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setShowImport(!showImport);
            setShowCreate(false);
            setShowImportNode(false);
          }}
        >
          {showImport ? "Cancel" : "Import Site"}
        </button>
        <span className="toolbar-separator" />
        <button
          className="btn"
          onClick={handleExportNode}
          disabled={nodeExportBusy}
        >
          {nodeExportBusy ? "Exporting…" : "Export Node"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setShowImportNode(!showImportNode);
            setShowCreate(false);
            setShowImport(false);
          }}
        >
          {showImportNode ? "Cancel" : "Import Node"}
        </button>
        <span className="toolbar-separator" />
        <button
          className="btn"
          onClick={() => {
            fetchSites();
            fetchStats();
            fetchStorage();
            fetchSysInfo();
          }}
          disabled={loading || statsLoading}
        >
          {loading || statsLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Compose Controls */}
      <div className="grengo-compose">
        <h3>Compose</h3>
        <div className="compose-actions">
          <button
            className="btn btn-primary"
            onClick={() => handleComposeUp(true)}
            disabled={composeBusy}
          >
            {composeBusy ? "Running…" : "Up --build"}
          </button>
          <button
            className="btn"
            onClick={() => handleComposeUp(false)}
            disabled={composeBusy}
          >
            Up
          </button>
          <button
            className="btn btn-danger"
            onClick={handleComposeDown}
            disabled={composeBusy}
          >
            Down
          </button>
          <span className="toolbar-separator" />
          <button
            className="btn btn-warning"
            onClick={() => handleMigrateAll(false)}
            disabled={migrateAllBusy}
          >
            {migrateAllBusy ? "Migrating…" : "Migrate All"}
          </button>
        </div>
        {composeOutput && <pre className="compose-output">{composeOutput}</pre>}
        {migrateAllOutput && (
          <pre className="compose-output">{migrateAllOutput}</pre>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateSiteForm
          apiBase={apiBase}
          onCreated={() => {
            setShowCreate(false);
            fetchSites();
          }}
        />
      )}

      {/* Import form */}
      {showImport && (
        <ImportSiteForm
          apiBase={apiBase}
          onImported={() => {
            setShowImport(false);
            fetchSites();
          }}
        />
      )}

      {/* Import Node form */}
      {showImportNode && (
        <ImportNodeForm
          apiBase={apiBase}
          onImported={() => {
            setShowImportNode(false);
            fetchSites();
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Sites table */}
      {(sites?.length ?? 0) === 0 && !loading ? (
        <div className="grengo-empty">
          No sites yet. Create one or import an archive.
        </div>
      ) : (
        <div className="grengo-table-wrap">
          <table className="grengo-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Port</th>
                <th>Status</th>
                <th>Running</th>
                <th>Armed</th>
                <th>Storage</th>
                <th>Domains</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const siteStorage = storage?.sites.find(
                  (s) => s.name === site.name,
                );
                const sitePct =
                  siteStorage && storage
                    ? (siteStorage.used / storage.total_limit) * 100
                    : 0;
                return (
                  <tr key={site.name}>
                    <td>
                      <strong>{site.name}</strong>
                    </td>
                    <td>{site.port}</td>
                    <td>
                      <span
                        className={`badge ${site.status === "enabled" ? "badge-enabled" : "badge-disabled"}`}
                      >
                        {site.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${site.running ? "badge-running" : "badge-stopped"}`}
                      >
                        {site.running ? "running" : "stopped"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${site.armed ? "badge-armed" : "badge-disarmed"}`}
                      >
                        {site.armed ? "armed" : "disarmed"}
                      </span>
                    </td>
                    <td className="site-storage-cell">
                      {siteStorage ? (
                        <div className="site-storage-mini">
                          <span className="site-storage-text">
                            {siteStorage.used_human}
                          </span>
                          <div className="stat-bar">
                            <div
                              className={`stat-bar-fill ${barClass(sitePct)}`}
                              style={{
                                width: `${Math.min(sitePct, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="domains">{site.domains.join(", ")}</td>
                    <td className="actions">
                      {site.running ? (
                        <button
                          className="btn"
                          onClick={() => siteAction(site.name, "stop")}
                          disabled={busy[site.name]}
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() => siteAction(site.name, "start")}
                          disabled={busy[site.name]}
                        >
                          Start
                        </button>
                      )}
                      {site.status === "enabled" ? (
                        <button
                          className="btn"
                          onClick={() => siteAction(site.name, "disable")}
                          disabled={busy[site.name]}
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() => siteAction(site.name, "enable")}
                          disabled={busy[site.name]}
                        >
                          Enable
                        </button>
                      )}
                      {site.armed ? (
                        <button
                          className="btn btn-warning"
                          onClick={() => siteAction(site.name, "disarm")}
                          disabled={busy[site.name]}
                        >
                          Disarm
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() => siteAction(site.name, "arm")}
                          disabled={busy[site.name]}
                        >
                          Arm
                        </button>
                      )}
                      <button
                        className="btn"
                        onClick={() => handleMigrate(site.name)}
                        disabled={busy[site.name] || migrateBusy[site.name]}
                      >
                        {migrateBusy[site.name] ? "Migrating…" : "Migrate"}
                      </button>
                      <button
                        className="btn"
                        onClick={() => openEnvEditor(site.name)}
                        disabled={busy[site.name]}
                      >
                        Env
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleExport(site.name)}
                        disabled={busy[site.name]}
                      >
                        Export
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(site.name)}
                        disabled={busy[site.name]}
                      >
                        Delete
                      </button>
                      {migrateOutput[site.name] && (
                        <div className="migrate-output-inline">
                          {migrateOutput[site.name]}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Env Editor */}
      {envSite && (
        <div className="grengo-env-editor">
          <div className="grengo-env-header">
            <h2>.env — {envSite}</h2>
            <div className="grengo-env-actions">
              {envDirty && (
                <span className="grengo-env-unsaved">unsaved changes</span>
              )}
              <button
                className="btn btn-primary"
                onClick={saveEnv}
                disabled={envSaving || !envDirty}
              >
                {envSaving ? "Saving…" : "Save"}
              </button>
              <button className="btn" onClick={closeEnvEditor}>
                Close
              </button>
            </div>
          </div>
          {envError && <div className="error">{envError}</div>}
          {envLoading ? (
            <div className="grengo-empty">Loading .env…</div>
          ) : (
            <MonacoEditor
              height={360}
              language="ini"
              code={envContent}
              onChange={setEnvDraft}
              editable
            />
          )}
        </div>
      )}

      {/* Storage Threshold */}
      {storage && (
        <div className="grengo-storage">
          <h2>Storage</h2>
          <div className="grengo-storage-overview">
            <div className="storage-total">
              <div className="storage-total-header">
                <strong>Total Upload Storage</strong>
                <span className="storage-total-value">
                  {storage.total_used_human} / {storage.total_limit_human}
                </span>
              </div>
              <div className="stat-bar">
                <div
                  className={`stat-bar-fill ${barClass(storage.total_percent)}`}
                  style={{ width: `${Math.min(storage.total_percent, 100)}%` }}
                />
              </div>
              <span className="storage-total-pct">
                {storage.total_percent.toFixed(1)}% used
                {storage.total_percent >= 80 && (
                  <span className="storage-warning"> — approaching limit!</span>
                )}
                {storage.total_percent >= 95 && (
                  <span className="storage-critical"> — critical!</span>
                )}
              </span>
            </div>
            {storage.sites.length > 0 && (
              <div className="storage-sites">
                <h3>Per Site</h3>
                <div className="storage-site-list">
                  {storage.sites.map((s) => (
                    <div className="storage-site-row" key={s.name}>
                      <span className="storage-site-name">{s.name}</span>
                      <span className="storage-site-used">{s.used_human}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {stats.length > 0 && (
        <div className="grengo-stats">
          <h2>Performance Metrics</h2>
          <div className="grengo-stats-cards">
            <StatsOverview stats={stats} />
            {stats.map((s) => (
              <div className="grengo-stat-card" key={s.name}>
                <div className="stat-card-header">
                  <strong>{s.name}</strong>
                </div>
                <div className="stat-card-grid">
                  <div className="stat-item">
                    <span className="stat-label">CPU</span>
                    <span className="stat-value">
                      {s.cpu_percent.toFixed(1)}%
                    </span>
                    <div className="stat-bar">
                      <div
                        className={`stat-bar-fill ${barClass(s.cpu_percent)}`}
                        style={{ width: `${Math.min(s.cpu_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Memory</span>
                    <span className="stat-value">
                      {s.mem_usage} / {s.mem_limit}
                    </span>
                    <div className="stat-bar">
                      <div
                        className={`stat-bar-fill ${barClass(s.mem_percent)}`}
                        style={{ width: `${Math.min(s.mem_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Net I/O</span>
                    <span className="stat-value">{s.net_io}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Block I/O</span>
                    <span className="stat-value">{s.block_io}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">PIDs</span>
                    <span className="stat-value">{s.pids}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {statsLoading && stats.length === 0 && (
        <div className="grengo-empty">Loading metrics…</div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function barClass(pct: number): string {
  if (pct >= 80) return "bar-danger";
  if (pct >= 50) return "bar-warning";
  return "bar-ok";
}

function parseMemMB(s: string): number {
  const m = s.match(/([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "gib" || unit === "gb") return val * 1024;
  if (unit === "kib" || unit === "kb") return val / 1024;
  return val; // MiB / MB
}

// ── Stats Overview ──────────────────────────────────────────────────────────

function StatsOverview({ stats }: { stats: ContainerStats[] }) {
  const totalCPU = stats.reduce((sum, s) => sum + s.cpu_percent, 0);
  const totalMemMB = stats.reduce((sum, s) => sum + parseMemMB(s.mem_usage), 0);
  const totalPIDs = stats.reduce((sum, s) => sum + s.pids, 0);

  const formatMem = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GiB`;
    return `${mb.toFixed(1)} MiB`;
  };

  return (
    <div className="grengo-stat-card grengo-stat-overview">
      <div className="stat-card-header">
        <strong>Totals</strong>
        <span className="stat-count">{stats.length} containers</span>
      </div>
      <div className="stat-card-grid">
        <div className="stat-item">
          <span className="stat-label">CPU</span>
          <span className="stat-value">{totalCPU.toFixed(1)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Memory</span>
          <span className="stat-value">{formatMem(totalMemMB)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">PIDs</span>
          <span className="stat-value">{totalPIDs}</span>
        </div>
      </div>
    </div>
  );
}

// ── Create Site Form ───────────────────────────────────────────────────────

function CreateSiteForm({
  apiBase,
  onCreated,
}: {
  apiBase: string;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateSiteParams>({
    name: "",
    port: "",
    domains: [],
    db_name: "",
    admin_password: "changeme",
    admin_email: "admin@localhost",
    session_timeout: "30",
    environment: "production",
    features: DEFAULT_FEATURES,
  });
  const [domainsText, setDomainsText] = useState("localhost");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof CreateSiteParams, value: string | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`${apiBase}/sites`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          domains: domainsText
            .split(/[\s,]+/)
            .map((d) => d.trim())
            .filter(Boolean),
        }),
      });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create site");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grengo-create-form">
      <h2>Create New Site</h2>
      {error && <div className="error">{error}</div>}
      <div className="form-grid">
        <label>
          Name *
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value.toLowerCase())}
            placeholder="my-site"
            autoFocus
          />
        </label>
        <label>
          Port
          <input
            value={form.port}
            onChange={(e) => set("port", e.target.value)}
            placeholder="auto"
          />
        </label>
        <label>
          Domains (space or comma separated)
          <input
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            placeholder="localhost example.com"
          />
        </label>
        <label>
          Database name
          <input
            value={form.db_name}
            onChange={(e) => set("db_name", e.target.value)}
            placeholder="same as name"
          />
        </label>
        <label>
          Admin password
          <input
            value={form.admin_password}
            onChange={(e) => set("admin_password", e.target.value)}
          />
        </label>
        <label>
          Admin email
          <input
            value={form.admin_email}
            onChange={(e) => set("admin_email", e.target.value)}
          />
        </label>
        <label>
          Session timeout (min)
          <input
            value={form.session_timeout}
            onChange={(e) => set("session_timeout", e.target.value)}
          />
        </label>
        <label>
          Environment
          <select
            value={form.environment}
            onChange={(e) => set("environment", e.target.value)}
          >
            <option value="production">production</option>
            <option value="development">development</option>
          </select>
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          Features (comma separated)
          <input
            value={form.features}
            onChange={(e) => set("features", e.target.value)}
            placeholder={DEFAULT_FEATURES}
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={saving || !form.name}
        >
          {saving ? "Creating…" : "Create Site"}
        </button>
      </div>
    </div>
  );
}

// ── Import Site Form ───────────────────────────────────────────────────────

function ImportSiteForm({
  apiBase,
  onImported,
}: {
  apiBase: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [port, setPort] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("archive", file);
      if (name) fd.append("name", name);
      if (port) fd.append("port", port);

      const token = localStorage.getItem("auth.accessToken");
      const res = await fetch(`/api${apiBase}/import`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Import failed");
      }
      onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grengo-import-form">
      <h2>Import Site</h2>
      {error && <div className="error">{error}</div>}
      <div className="import-fields">
        <label>
          Archive (.tar.gz)
          <input
            type="file"
            accept=".tar.gz,.tgz"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Override name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label>
          Override port
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="optional"
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={importing || !file}
        >
          {importing ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}

// ── Import Node Form ───────────────────────────────────────────────────────

function ImportNodeForm({
  apiBase,
  onImported,
}: {
  apiBase: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!file) return;
    if (
      !confirm(
        "Import a full node archive? This will add all clients from the archive.",
      )
    )
      return;
    setImporting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("archive", file);

      const token = localStorage.getItem("auth.accessToken");
      const res = await fetch(`/api${apiBase}/import-node`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Node import failed");
      }
      onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Node import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grengo-import-form">
      <h2>Import Node Archive</h2>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          marginBottom: "0.75rem",
        }}
      >
        Import a full node archive containing all clients, databases, and
        uploads.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="import-fields">
        <label>
          Node archive (.tar.gz)
          <input
            type="file"
            accept=".tar.gz,.tgz"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={importing || !file}
        >
          {importing ? "Importing…" : "Import Node"}
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../utils/api";
import "./GrengoDashboard.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface SiteInfo {
  name: string;
  port: string;
  status: string;
  running: boolean;
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

const DEFAULT_FEATURES = "landing,store,forum,cart,users,inbox,presence";

// ── Component ──────────────────────────────────────────────────────────────

export default function GrengoDashboard() {
  // Passcode state — stored in memory only.
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard state.
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Panels.
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Busy state per-site for actions.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // ── Passcode headers helper ──────────────────────────────────────────

  const passcodeHeaders = useCallback(
    (): Record<string, string> => ({
      "X-Grengo-P1": p1,
      "X-Grengo-P2": p2,
    }),
    [p1, p2],
  );

  const grengoRequest = useCallback(
    async <T,>(endpoint: string, opts: RequestInit = {}): Promise<T> => {
      const headers = {
        ...passcodeHeaders(),
        ...(opts.headers as Record<string, string>),
      };
      return apiRequest<T>(endpoint, { ...opts, headers });
    },
    [passcodeHeaders],
  );

  // ── Auth ─────────────────────────────────────────────────────────────

  const handleUnlock = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await apiRequest<{ ok?: boolean; error?: string }>(
        "/grengo/auth",
        {
          method: "POST",
          body: JSON.stringify({ p1, p2 }),
        },
      );
      if (!res || res.error) {
        setAuthError(res?.error || "Unexpected server response");
        return;
      }
      setUnlocked(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLock = () => {
    setUnlocked(false);
    setP1("");
    setP2("");
    setSites([]);
  };

  // ── Fetch sites ──────────────────────────────────────────────────────

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await grengoRequest<SiteInfo[]>("/grengo/sites");
      setSites(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sites");
    } finally {
      setLoading(false);
    }
  }, [grengoRequest]);

  useEffect(() => {
    if (unlocked) fetchSites();
  }, [unlocked, fetchSites]);

  // ── Site actions ─────────────────────────────────────────────────────

  const siteAction = async (
    name: string,
    action: string,
    method: string = "POST",
  ) => {
    setBusy((prev) => ({ ...prev, [name]: true }));
    try {
      await grengoRequest(`/grengo/sites/${name}/${action}`, { method });
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
      await grengoRequest(`/grengo/sites/${name}`, { method: "DELETE" });
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
      const res = await fetch(`/api/grengo/sites/${name}/export`, {
        headers: {
          ...passcodeHeaders(),
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

  // ── Render: Passcode gate ────────────────────────────────────────────

  if (!unlocked) {
    return (
      <div className="grengo-gate">
        <h2>Grengo Dashboard</h2>
        <p>Enter your server passcode to unlock remote management.</p>
        {authError && <div className="error">{authError}</div>}
        <label>
          Passcode Part 1 (password)
          <input
            type="password"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Passcode Part 2 (salt)
          <input
            type="password"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          />
        </label>
        <button
          className="btn btn-primary"
          onClick={handleUnlock}
          disabled={authLoading || !p1 || !p2}
          style={{ marginTop: "0.75rem", width: "100%" }}
        >
          {authLoading ? "Verifying…" : "Unlock"}
        </button>
      </div>
    );
  }

  // ── Render: Dashboard ────────────────────────────────────────────────

  return (
    <div className="grengo-dashboard">
      <h1>Grengo Dashboard</h1>

      <div className="grengo-lock-bar">
        <button className="btn" onClick={handleLock}>
          Lock
        </button>
      </div>

      {/* Toolbar */}
      <div className="grengo-toolbar">
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowCreate(!showCreate);
            setShowImport(false);
          }}
        >
          {showCreate ? "Cancel" : "+ New Site"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setShowImport(!showImport);
            setShowCreate(false);
          }}
        >
          {showImport ? "Cancel" : "Import"}
        </button>
        <button className="btn" onClick={fetchSites} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateSiteForm
          passcodeHeaders={passcodeHeaders()}
          onCreated={() => {
            setShowCreate(false);
            fetchSites();
          }}
        />
      )}

      {/* Import form */}
      {showImport && (
        <ImportSiteForm
          passcodeHeaders={passcodeHeaders()}
          onImported={() => {
            setShowImport(false);
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
                <th>Domains</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Create Site Form ───────────────────────────────────────────────────────

function CreateSiteForm({
  passcodeHeaders,
  onCreated,
}: {
  passcodeHeaders: Record<string, string>;
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
      await apiRequest("/grengo/sites", {
        method: "POST",
        headers: passcodeHeaders,
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
  passcodeHeaders,
  onImported,
}: {
  passcodeHeaders: Record<string, string>;
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
      const res = await fetch("/api/grengo/import", {
        method: "POST",
        headers: {
          ...passcodeHeaders,
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

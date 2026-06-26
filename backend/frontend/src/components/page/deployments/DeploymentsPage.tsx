import { useAtomValue } from "jotai";
import {
  ChevronDown,
  ChevronUp,
  Play,
  Plus,
  RefreshCw,
  Server,
  Square,
  Trash2,
} from "lucide-react";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { socketAtom } from "../../../atoms/auth";
import { apiRequest } from "../../../utils/api";
import { sendWebSocketMessage } from "../../../utils/wsProtobuf";
import Button from "../../input/Button";
import Select from "../../input/Select";
import Input from "../../input/Input";
import { Console, type ConsoleLine } from "../../ui/Console";
import { customConfirm } from "../../ui/Prompt";
import type { TableColumn } from "../../ui/TableView/TableView";
import { DirectoryLayout } from "../layout/templates/DirectoryLayout";
import "./Deployments.css";
// Reuse orders page CSS for expand buttons and status pills if needed
import "../../store/OrdersPage.css";
import { useLayoutPosition } from "../../../atoms/viewModes";
import { GlassMenu } from "../../ui/GlassMenu";

interface Blueprint {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
}

interface Instance {
  id: number;
  blueprint_id: number;
  status: string;
  version_tag: string;
  config_payload: {
    url?: string;
    port?: number;
    [key: string]: any;
  };
}

interface LogEntry {
  time: string;
  level: string;
  prefix: string;
  msg: string;
  file?: string;
  line?: number;
  func?: string;
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
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  NetIO?: string;
}

type ViewMode = "grid" | "list";

export function DeploymentsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedInstances, setExpandedInstances] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useLayoutPosition<ViewMode>("deployments", "list");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedFrappeVersion, setSelectedFrappeVersion] = useState<"15" | "16" | "17-dev">("16");
  const [logCap, setLogCap] = useState(500);
  const logCapRef = useRef(logCap);
  const [openAppsMenu, setOpenAppsMenu] = useState<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const [stats, setStats] = useState<ContainerStats[]>([]);
  type AppForReact = { name: string; description: string; version?: string };
  const availableApps: AppForReact[] = [
    {
      name: "erpnext",
      description: "ERPNext is a comprehensive open source ERP system for businesses.",
      version: "",
    },
    {
      name: "builder",
      description: "Builder helps you visually design and customize Frappe apps.",
      version: "",
    },
    {
      name: "frappe",
      description: "Frappe Framework is a full-stack web application framework in Python & JS.",
      version: "",
    },
    {
      name: "hrms",
      description:
        "HRMS provides human resource management features like payroll, leave, and attendance.",
      version: "",
    },
    {
      name: "lending",
      description: "Lending app for managing loan requests, approvals, and repayments.",
      version: "",
    },
    {
      name: "helpdesk",
      description: "Helpdesk app to manage support tickets and customer queries.",
      version: "",
    },
    {
      name: "crm",
      description: "CRM app to manage leads, opportunities, and customer relationships.",
      version: "",
    },
    {
      name: "insights",
      description: "Insights provides analytics and reporting tools within the Frappe ecosystem.",
      version: "",
    },
    {
      name: "blog",
      description: "Blog app for publishing articles and managing content.",
      version: "",
    },
  ];

  useEffect(() => {
    logCapRef.current = logCap;
  }, [logCap]);

  const socket = useAtomValue(socketAtom);

  useEffect(() => {
    fetchBlueprints();
    fetchInstances();

    const handleProgress = (event: Event) => {
      const customEvent = event as CustomEvent;
      setLogs(prev => {
        const next = [...prev, customEvent.detail];
        const max = logCapRef.current;
        return next.length > max ? next.slice(next.length - max) : next;
      });
    };

    const handleStatus = (event: Event) => {
      const customEvent = event as CustomEvent;
      setInstances(prev =>
        prev.map(inst =>
          inst.id === customEvent.detail.id ? { ...inst, status: customEvent.detail.status } : inst
        )
      );
    };

    window.addEventListener("provisioning:progress", handleProgress);
    window.addEventListener("provisioning:status", handleStatus);

    return () => {
      window.removeEventListener("provisioning:progress", handleProgress);
      window.removeEventListener("provisioning:status", handleStatus);
    };
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiRequest<ContainerStats[]>("/provisioning/stats");
        setStats(data || []);
      } catch (err) {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Available apps are now statically defined above

  // Handled inside Console component

  // Auto-subscribe to provisioning_logs for every known instance so the status
  // badge updates in real-time without requiring the user to expand the row.
  useEffect(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN || instances.length === 0) return;
    for (const inst of instances) {
      sendWebSocketMessage(socket, {
        type: "subscribe",
        payload: { resource_type: "provisioning_logs", resource_id: inst.id },
      });
    }
  }, [socket, instances]);

  const fetchBlueprints = async () => {
    try {
      const data = await apiRequest<Blueprint[]>("/provisioning/blueprints");
      setBlueprints(data || []);
    } catch (err) {
      toast.error("Failed to load blueprints");
    }
  };

  const fetchInstances = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Instance[]>("/provisioning/instances");
      setInstances(data || []);
    } catch (err) {
      toast.error("Failed to load instances");
    } finally {
      setLoading(false);
    }
  };

  const provisionInstance = async (blueprintId: number, blueprintName: string) => {
    try {
      await apiRequest("/provisioning/instances", {
        method: "POST",
        body: JSON.stringify({
          blueprint_id: blueprintId,
          version_tag: blueprintName.toLowerCase().includes("frappe")
            ? selectedFrappeVersion
            : "latest",
          config_payload: "e30=", // base64 {}
        }),
      });
      toast.success(`Provisioning job for ${blueprintName} started.`);
      setShowNewModal(false);
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to provision instance");
    }
  };

  const deleteInstance = async (id: number) => {
    if (!(await customConfirm(`Are you sure you want to tear down instance #${id}?`))) return;
    try {
      await apiRequest(`/provisioning/instances/${id}`, { method: "DELETE" });
      toast.success("Instance torn down successfully.");
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to tear down instance");
    }
  };

  const startInstance = async (id: number) => {
    try {
      await apiRequest(`/provisioning/instances/${id}/start`, {
        method: "POST",
      });
      toast.success("Instance started.");
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start instance");
    }
  };

  const stopInstance = async (id: number) => {
    try {
      await apiRequest(`/provisioning/instances/${id}/stop`, {
        method: "POST",
      });
      toast.success("Instance stopped.");
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop instance");
    }
  };

  const restartInstance = async (id: number) => {
    try {
      await apiRequest(`/provisioning/instances/${id}/restart`, {
        method: "POST",
      });
      toast.success("Instance restart requested. View logs for progress.");
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restart instance");
    }
  };

  const installApp = async (id: number, app: string, version?: string) => {
    try {
      await apiRequest(`/provisioning/instances/${id}/apps`, {
        method: "POST",
        body: JSON.stringify({ app, version }),
      });
      toast.success(`App ${app} queued for installation. Check logs.`);
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to install app");
    }
  };

  const uninstallApp = async (id: number, app: string) => {
    try {
      await apiRequest(`/provisioning/instances/${id}/apps/${app}`, {
        method: "DELETE",
      });
      toast.success(`App ${app} queued for uninstallation. Check logs.`);
      fetchInstances();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to uninstall app");
    }
  };

  const fetchInstanceLogs = async (id: number) => {
    try {
      // It returns raw text
      const resp = await fetch(`/api/provisioning/instances/${id}/logs`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (resp.ok) {
        const historicalLogs: LogEntry[] = await resp.json();
        setLogs(prev => {
          const filtered = prev.filter(l => l.prefix !== String(id) || l.time !== "historical");
          if (!historicalLogs || historicalLogs.length === 0) return filtered;
          return [...filtered, ...historicalLogs];
        });
      }
    } catch (err) {
      console.error("Failed to fetch instance logs", err);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedInstances(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
        if (socket && socket.readyState === WebSocket.OPEN) {
          sendWebSocketMessage(socket, {
            type: "unsubscribe",
            payload: { resource_type: "provisioning_logs", resource_id: id },
          });
        }
      } else {
        newSet.add(id);
        const inst = instances.find(i => i.id === id);
        if (
          inst &&
          (inst.status === "running" || inst.status === "stopped" || inst.status === "failed")
        ) {
          fetchInstanceLogs(id);
        }
        if (socket && socket.readyState === WebSocket.OPEN) {
          sendWebSocketMessage(socket, {
            type: "subscribe",
            payload: { resource_type: "provisioning_logs", resource_id: id },
          });
        }
      }
      return newSet;
    });
  };

  const filteredInstances = useMemo(() => {
    if (!search.trim()) return instances;
    const q = search.toLowerCase();
    return instances.filter(inst => {
      const bp = blueprints.find(b => b.id === inst.blueprint_id);
      return (
        String(inst.id).includes(q) ||
        bp?.name.toLowerCase().includes(q) ||
        inst.status.toLowerCase().includes(q)
      );
    });
  }, [instances, blueprints, search]);

  const instanceColumns: TableColumn<Instance>[] = [
    {
      header: "",
      width: "44px",
      cell: inst => {
        const isExpanded = expandedInstances.has(inst.id);
        return (
          <button
            type="button"
            className="orders-expand-btn"
            onClick={event => {
              event.stopPropagation();
              toggleExpand(inst.id);
            }}
            title={isExpanded ? "Collapse Logs" : "Expand Logs"}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        );
      },
    },
    {
      header: "Instance",
      width: "minmax(110px, 0.8fr)",
      className: "table-view__cell--bold",
      cell: inst => `#${inst.id}`,
    },
    {
      header: "Blueprint",
      width: "minmax(140px, 1fr)",
      cell: inst => {
        const bp = blueprints.find(b => b.id === inst.blueprint_id);
        return bp ? bp.name : `Blueprint ${inst.blueprint_id}`;
      },
    },
    {
      header: "Version",
      width: "minmax(100px, 0.8fr)",
      className: "table-view__cell--muted",
      cell: inst => inst.version_tag,
    },
    {
      header: "URL",
      width: "minmax(180px, 1fr)",
      cell: inst =>
        inst.config_payload?.url ? (
          <a
            href={inst.config_payload.url}
            target="_blank"
            rel="noopener noreferrer"
            className="table-link"
            onClick={e => e.stopPropagation()}
          >
            {inst.config_payload.url}
          </a>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Status",
      width: "minmax(120px, 1fr)",
      cell: inst => {
        let statusClass = "pending";
        if (inst.status === "running") statusClass = "completed";
        if (inst.status === "failed") statusClass = "failed";
        return (
          <span className={`orders-status orders-status--${statusClass}`}>
            {inst.status.toUpperCase()}
          </span>
        );
      },
    },
    {
      header: "Actions",
      width: "160px",
      className: "table-view__cell--actions",
      cell: inst => (
        <div
          className="table-view__row-actions"
          onClick={e => e.stopPropagation()}
          style={{
            position: "relative",
            ...(openAppsMenu?.id === inst.id ? { opacity: 1, pointerEvents: "auto" } : {}),
          }}
        >
          {inst.status === "stopped" && (
            <button
              type="button"
              className="action-btn"
              onClick={() => startInstance(inst.id)}
              title="Start"
            >
              <Play size={14} />
            </button>
          )}
          {inst.status === "running" && (
            <>
              <button
                type="button"
                className="action-btn"
                onClick={() => restartInstance(inst.id)}
                title="Restart"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                className="action-btn danger"
                onClick={() => stopInstance(inst.id)}
                title="Stop"
              >
                <Square size={14} />
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={e => {
                  e.stopPropagation();
                  if (openAppsMenu?.id === inst.id) {
                    setOpenAppsMenu(null);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setOpenAppsMenu({
                      id: inst.id,
                      x: rect.right,
                      y: rect.bottom,
                    });
                  }
                }}
                title="Manage Apps"
              >
                Apps
              </button>
            </>
          )}
          <button
            type="button"
            className="action-btn danger"
            onClick={() => deleteInstance(inst.id)}
            title="Tear Down Instance"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const renderInstanceRow = (
    inst: Instance,
    _index: number,
    rowProps: { className: string; style: React.CSSProperties },
    cells: React.ReactNode[]
  ) => {
    const isExpanded = expandedInstances.has(inst.id);
    const instanceLogs = logs.filter(log => log.prefix === String(inst.id));

    const consoleLines: ConsoleLine[] = instanceLogs.map((log, i) => ({
      id: i,
      prefix: `[${log.time || "historical"}] [${(log.level || "info").toUpperCase()}] [worker]`,
      level: log.level || "info",
      text:
        log.msg +
        (log.file && log.func && log.time !== "historical"
          ? ` (${log.file}:${log.line} in ${log.func})`
          : ""),
    }));

    const frappeStat = stats.find((s: any) => {
      const n = s.name || s.Name || "";
      return n === "skaia_test_frappe";
    });

    let cpu = "0.0%";
    let mem = "0MB";
    let net = "0B";
    if (frappeStat) {
      cpu =
        typeof frappeStat.cpu_percent === "number"
          ? `${frappeStat.cpu_percent.toFixed(1)}%`
          : frappeStat.CPUPerc || "0.0%";
      mem = frappeStat.mem_usage || frappeStat.MemUsage || "0MB";
      net = frappeStat.net_io || frappeStat.NetIO || "0B";
    }

    return (
      <React.Fragment key={inst.id}>
        <div
          {...rowProps}
          className={`${rowProps.className} order-row-hover`}
          onClick={() => toggleExpand(inst.id)}
        >
          {cells}
        </div>
        {isExpanded && (
          <div className="provisioning-expanded-row" style={{ padding: "1rem" }}>
            <Console
              lines={consoleLines}
              title={
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <span>
                    Live Logs: <span style={{ fontWeight: 400 }}>Instance #{inst.id}</span>
                  </span>
                  {frappeStat && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        fontSize: "0.8rem",
                        fontWeight: 400,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span title="CPU Usage">
                        CPU: <span style={{ color: "var(--text-primary)" }}>{cpu}</span>
                      </span>
                      <span title="Memory Usage">
                        MEM: <span style={{ color: "var(--text-primary)" }}>{mem}</span>
                      </span>
                      <span title="Network I/O">
                        NET: <span style={{ color: "var(--text-primary)" }}>{net}</span>
                      </span>
                    </div>
                  )}
                </div>
              }
              readOnly={true}
              defaultOpen={true}
              collapsible={false}
              logCap={logCap}
              onLogCapChange={setLogCap}
            />
          </div>
        )}
      </React.Fragment>
    );
  };

  const NewDeploymentModal = () => {
    return createPortal(
      <div className="modal-backdrop" onClick={() => setShowNewModal(false)}>
        <div className="modal-content deployments-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>New Deployment</h3>
            <button className="modal-close" onClick={() => setShowNewModal(false)}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-subtitle">
              Select an available blueprint to provision a new instance.
            </p>
            {blueprints.length === 0 ? (
              <p className="orders-empty-state">No active blueprints currently available.</p>
            ) : (
              <div className="blueprint-grid">
                {blueprints.map(bp => (
                  <div key={bp.id} className="blueprint-card">
                    <div>
                      <h4>{bp.name}</h4>
                      <p>{bp.description}</p>
                      {bp.name.toLowerCase().includes("frappe") && (
                        <div style={{ marginTop: "1rem" }}>
                          <Select
                            size="sm"
                            block
                            value={selectedFrappeVersion}
                            onChange={e =>
                              setSelectedFrappeVersion(e.target.value as "15" | "16" | "17-dev")
                            }
                            options={[
                              { value: "16", label: "Stable 16" },
                              { value: "15", label: "Stable 15" },
                              { value: "17-dev", label: "Dev 17" },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="action"
                      onClick={() => provisionInstance(bp.id, bp.name)}
                    >
                      Deploy {bp.name}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <DirectoryLayout
        className="deployments-directory"
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Server size={24} style={{ color: "var(--primary-color)" }} />
            <span>Deployments</span>
          </div>
        }
        subtitle="Manage your provisioned instances and infrastructure."
        headerActions={
          <button
            className="btn btn-ghost ds-page__create-btn"
            onClick={() => setShowNewModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Plus size={16} /> New Deployment
          </button>
        }
        searchPlaceholder="Search deployments…"
        searchValue={search}
        onSearchChange={setSearch}
        metrics={[
          <span key="count">
            {filteredInstances.length} instance
            {filteredInstances.length !== 1 ? "s" : ""}
          </span>,
        ]}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        items={loading ? [] : filteredInstances}
        emptyState={
          loading ? (
            <div className="ds-page__loading">
              <div className="ds-skeleton" />
              <div className="ds-skeleton" />
              <div className="ds-skeleton" />
            </div>
          ) : instances.length === 0 ? (
            <div className="ds-page__empty" style={{ textAlign: "center", padding: "4rem 2rem" }}>
              <Server size={48} style={{ color: "var(--text-muted)", marginBottom: "1rem" }} />
              <h3>No instances deployed yet</h3>
              <p style={{ color: "var(--text-secondary)" }}>
                Provision a new infrastructure blueprint to get started.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowNewModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "1rem",
                }}
              >
                <Plus size={16} /> New Deployment
              </button>
            </div>
          ) : null
        }
        tableColumns={instanceColumns}
        tableRowKey={inst => inst.id}
        renderRowWrapper={renderInstanceRow}
        renderGridCard={inst => (
          <div key={inst.id} className="ds-card" onClick={() => toggleExpand(inst.id)}>
            <div className="ds-card__header">
              <div className="ds-card__title-row">
                <Server size={16} className="ds-card__type-icon" />
                <h3 className="ds-card__title">Instance #{inst.id}</h3>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {inst.status === "stopped" && (
                  <button
                    className="action-btn"
                    onClick={e => {
                      e.stopPropagation();
                      startInstance(inst.id);
                    }}
                  >
                    <Play size={14} />
                  </button>
                )}
                {inst.status === "running" && (
                  <>
                    <button
                      className="action-btn"
                      onClick={e => {
                        e.stopPropagation();
                        restartInstance(inst.id);
                      }}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="action-btn danger"
                      onClick={e => {
                        e.stopPropagation();
                        stopInstance(inst.id);
                      }}
                    >
                      <Square size={14} />
                    </button>
                  </>
                )}
                <button
                  className="action-btn danger ds-card__danger-btn"
                  onClick={e => {
                    e.stopPropagation();
                    deleteInstance(inst.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="ds-card__desc">
              Blueprint:{" "}
              {blueprints.find(b => b.id === inst.blueprint_id)?.name || `ID ${inst.blueprint_id}`}
            </p>
            <div className="ds-card__meta">
              <span
                className={`orders-status orders-status--${inst.status === "running" ? "completed" : inst.status === "failed" ? "failed" : "pending"}`}
              >
                {inst.status.toUpperCase()}
              </span>
              {inst.config_payload?.url && (
                <a
                  href={inst.config_payload.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: "12px", color: "var(--primary-color)" }}
                >
                  {inst.config_payload.url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        )}
      />
      {showNewModal && <NewDeploymentModal />}
      {openAppsMenu && (
        <GlassMenu
          x={openAppsMenu.x}
          y={openAppsMenu.y}
          onClose={() => setOpenAppsMenu(null)}
          options={
            availableApps.length === 0
              ? [{ title: "No apps available", disabled: true }]
              : availableApps.map(app => {
                  console.log("Available app:", app.name, app.description);
                  const inst = instances.find(i => i.id === openAppsMenu.id);
                  const isInstalled = inst?.config_payload?.apps?.includes(app.name) || false;

                  return {
                    key: app.name,
                    title: (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          width: "100%",
                          gap: "16px",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{app.name}</span>
                        <span
                          role="button"
                          className={`action-btn ${isInstalled ? "danger" : ""}`}
                          style={{
                            padding: "2px 6px",
                            height: "auto",
                            fontSize: "0.7rem",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            if (isInstalled) uninstallApp(openAppsMenu.id, app.name);
                            else installApp(openAppsMenu.id, app.name);
                            setOpenAppsMenu(null);
                          }}
                        >
                          {isInstalled ? "Uninstall" : "Install"}
                        </span>
                      </div>
                    ),
                    subOptions: [
                      {
                        key: "desc",
                        title: (
                          <div
                            style={{
                              whiteSpace: "normal",
                              lineHeight: 1.4,
                              maxWidth: "200px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontWeight: 600,
                                  display: "block",
                                  marginBottom: "4px",
                                }}
                              >
                                {app.name}{" "}
                              </span>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                                {app.description}
                              </span>
                            </div>
                            {!isInstalled && (
                              <Input
                                placeholder="Version tag/branch (optional)"
                                handleSend={val => {
                                  installApp(openAppsMenu.id, app.name, val);
                                  setOpenAppsMenu(null);
                                }}
                              />
                            )}
                          </div>
                        ),
                      },
                    ],
                  };
                })
          }
        />
      )}
    </>
  );
}

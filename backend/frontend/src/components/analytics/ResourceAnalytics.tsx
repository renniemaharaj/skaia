import { useCallback, useEffect, useState } from "react";
import { X, BarChart3, Users, Eye } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiRequest } from "../../utils/api";
import UserAvatar from "../user/UserAvatar";
import "./ResourceAnalytics.css";

/* ── types ─────────────────────────────────────────────── */

interface ViewStat {
  date: string;
  views: number;
  unique_ips: number;
  unique_users: number;
}

interface StatsResponse {
  resource: string;
  resource_id: number;
  days: number;
  total_views: number;
  unique_viewers: number;
  unique_ips: number;
  daily: ViewStat[] | null;
}

interface VisitorEntry {
  id: number;
  ip: string;
  user_id: number | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface VisitorsResponse {
  visitors: VisitorEntry[];
}

interface Props {
  resource: "page" | "thread";
  resourceId: number;
  title?: string;
  onClose: () => void;
}

/* ── constants ─────────────────────────────────────────── */

type Tab = "overview" | "visitors";
const PAGE_SIZE = 50;

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
];

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* ── component ─────────────────────────────────────────── */

export default function ResourceAnalytics({
  resource,
  resourceId,
  title,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  // visitors
  const [visitors, setVisitors] = useState<VisitorEntry[]>([]);
  const [visitorsLoading, setVisitorsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [identifiedOnly, setIdentifiedOnly] = useState(false);

  /* ── load overview stats ──────────────────────────────── */

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<StatsResponse>(
        `/api/analytics/views/${resource}/${resourceId}?days=${days}`,
      );
      setData(res);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [resource, resourceId, days]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  /* ── load visitors ────────────────────────────────────── */

  const loadVisitors = useCallback(
    async (offset: number) => {
      setVisitorsLoading(true);
      try {
        const identified = identifiedOnly ? "&identified=true" : "";
        const res = await apiRequest<VisitorsResponse>(
          `/api/analytics/visitors/${resource}/${resourceId}?limit=${PAGE_SIZE}&offset=${offset}${identified}`,
        );
        const list = res.visitors ?? [];
        setVisitors((prev) => (offset === 0 ? list : [...prev, ...list]));
        setHasMore(list.length === PAGE_SIZE);
      } catch {
        // silent
      } finally {
        setVisitorsLoading(false);
      }
    },
    [resource, resourceId, identifiedOnly],
  );

  // reset + fetch when switching to visitors tab or filter changes
  useEffect(() => {
    if (tab === "visitors") {
      setVisitors([]);
      setHasMore(true);
      loadVisitors(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, identifiedOnly]);

  /* ── keyboard ─────────────────────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ── derived ──────────────────────────────────────────── */

  const chartColor = "var(--primary-color)";
  const daily = data?.daily ?? [];

  /* ── render ───────────────────────────────────────────── */

  return (
    <div className="ra-overlay" onClick={onClose}>
      <div className="ra-panel" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="ra-header">
          <h3>
            <BarChart3 size={16} />
            {title
              ? `Analytics — ${title}`
              : `${resource === "page" ? "Page" : "Thread"} Analytics`}
          </h3>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* tabs */}
        <div className="ra-tabs">
          <button
            className={`ra-tab ${tab === "overview" ? "ra-tab--active" : ""}`}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            className={`ra-tab ${tab === "visitors" ? "ra-tab--active" : ""}`}
            onClick={() => setTab("visitors")}
          >
            Visitors
          </button>
        </div>

        <div className="ra-body">
          {/* ───── stat cards (always visible) ───── */}
          {!loading && (
            <div className="ra-stats">
              <div className="ra-stat">
                <div className="ra-stat__value">
                  {(data?.total_views ?? 0).toLocaleString()}
                </div>
                <div className="ra-stat__label">Total Views</div>
              </div>
              <div className="ra-stat">
                <div className="ra-stat__value">
                  {(data?.unique_viewers ?? 0).toLocaleString()}
                </div>
                <div className="ra-stat__label">Unique Users</div>
              </div>
              <div className="ra-stat">
                <div className="ra-stat__value">
                  {(data?.unique_ips ?? 0).toLocaleString()}
                </div>
                <div className="ra-stat__label">Unique IPs</div>
              </div>
              <div className="ra-stat">
                <div className="ra-stat__value">
                  {daily.length > 0
                    ? Math.round(
                        daily.reduce((sum, d) => sum + d.views, 0) /
                          daily.length,
                      )
                    : 0}
                </div>
                <div className="ra-stat__label">Avg / Day</div>
              </div>
            </div>
          )}

          {/* ───── overview tab ───── */}
          {tab === "overview" && (
            <>
              {loading ? (
                <div className="ra-loading">Loading analytics…</div>
              ) : (
                <>
                  <div className="ra-chart-header">
                    <span>Views Over Time</span>
                    <select
                      className="ra-range-select"
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                    >
                      {RANGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ra-chart-wrap">
                    {daily.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={daily}>
                          <defs>
                            <linearGradient
                              id="viewGradient"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={chartColor}
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="100%"
                                stopColor={chartColor}
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border-color)"
                          />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 11 }}
                            stroke="var(--text-secondary)"
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                            stroke="var(--text-secondary)"
                            width={36}
                          />
                          <Tooltip
                            labelFormatter={(label) =>
                              new Date(label as string).toLocaleDateString()
                            }
                            contentStyle={{
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border-color)",
                              borderRadius: 6,
                              fontSize: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="views"
                            name="Views"
                            stroke={chartColor}
                            fill="url(#viewGradient)"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="unique_users"
                            name="Unique Users"
                            stroke="var(--info-color)"
                            fill="none"
                            strokeWidth={1.5}
                            strokeDasharray="4 2"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="ra-loading">No view data yet</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ───── visitors tab ───── */}
          {tab === "visitors" && (
            <>
              {/* filter bar */}
              <div className="ra-visitors-toolbar">
                <label className="ra-filter-toggle">
                  <input
                    type="checkbox"
                    checked={identifiedOnly}
                    onChange={(e) => setIdentifiedOnly(e.target.checked)}
                  />
                  <Users size={13} />
                  Identified visitors only
                </label>
                {identifiedOnly && (
                  <span className="ra-filter-badge">
                    <Eye size={12} /> Showing visits with known user
                  </span>
                )}
              </div>

              {visitorsLoading && visitors.length === 0 ? (
                <div className="ra-loading">Loading visitors…</div>
              ) : visitors.length === 0 ? (
                <div className="ra-empty-visitors">
                  {identifiedOnly
                    ? "No identified visitors yet"
                    : "No visitor data yet"}
                </div>
              ) : (
                <>
                  <table className="ra-visitors">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>IP Address</th>
                        <th>User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitors.map((v) => (
                        <tr key={v.id}>
                          <td>{formatTimestamp(v.created_at)}</td>
                          <td>
                            <span className="ra-ip">{v.ip || "—"}</span>
                          </td>
                          <td>
                            {v.user_id ? (
                              <span className="ra-visitor-user">
                                <UserAvatar
                                  src={v.avatar_url}
                                  alt={v.display_name || v.username || "User"}
                                  size={18}
                                  initials={(
                                    v.display_name ||
                                    v.username ||
                                    "?"
                                  )
                                    .charAt(0)
                                    .toUpperCase()}
                                />
                                <span>
                                  {v.display_name || v.username || "User"}
                                </span>
                              </span>
                            ) : (
                              <span className="ra-visitor-anon">None</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {hasMore && (
                    <div className="ra-load-more">
                      <button
                        onClick={() => loadVisitors(visitors.length)}
                        disabled={visitorsLoading}
                      >
                        {visitorsLoading ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

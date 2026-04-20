import { Fragment, useCallback, useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // visitors
  const [visitors, setVisitors] = useState<VisitorEntry[]>([]);
  const [visitorsLoading, setVisitorsLoading] = useState(false);
  const [visitorsError, setVisitorsError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [identifiedOnly, setIdentifiedOnly] = useState(false);

  /* ── load overview stats ──────────────────────────────── */

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<StatsResponse>(
        `/analytics/views/${resource}/${resourceId}?days=${days}`,
      );
      if (!res) {
        throw new Error("Invalid analytics response");
      }
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
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
      if (offset === 0) setVisitorsError(null);
      try {
        const identified = identifiedOnly ? "&identified=true" : "";
        const res = await apiRequest<VisitorsResponse>(
          `/analytics/visitors/${resource}/${resourceId}?limit=${PAGE_SIZE}&offset=${offset}${identified}`,
        );
        if (!res) {
          throw new Error("Invalid visitors response");
        }
        const list = res.visitors ?? [];
        setVisitors((prev) => (offset === 0 ? list : [...prev, ...list]));
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        setVisitorsError(
          err instanceof Error ? err.message : "Failed to load visitors",
        );
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

  const getIpUserMap = (entries: VisitorEntry[]) => {
    const map = new Map<string, VisitorEntry>();
    for (const entry of entries) {
      if (entry.ip && entry.user_id != null) {
        if (!map.has(entry.ip)) {
          map.set(entry.ip, entry);
        }
      }
    }
    return map;
  };

  const ipUserMap = getIpUserMap(visitors);

  const effectiveVisitor = (entry: VisitorEntry) => {
    if (entry.user_id != null) {
      return entry;
    }
    if (entry.ip && ipUserMap.has(entry.ip)) {
      return ipUserMap.get(entry.ip)!;
    }
    return entry;
  };

  const visitorKey = (entry: VisitorEntry) => {
    const effective = effectiveVisitor(entry);
    return effective.user_id != null
      ? `user:${effective.user_id}`
      : `anon:${entry.ip ?? "unknown"}`;
  };

  const visitorLabel = (entry: VisitorEntry) => {
    const effective = effectiveVisitor(entry);
    return effective.user_id
      ? effective.display_name || effective.username || "User"
      : "Anonymous";
  };

  const renderVisitorUser = (entry: VisitorEntry) => {
    const effective = effectiveVisitor(entry);
    if (!effective.user_id) {
      return <span className="ra-visitor-anon">Anonymous</span>;
    }

    return (
      <>
        <UserAvatar
          src={effective.avatar_url}
          alt={effective.display_name || effective.username || "User"}
          size={18}
          initials={(effective.display_name || effective.username || "?")
            .charAt(0)
            .toUpperCase()}
        />
        <span>{effective.display_name || effective.username || "User"}</span>
      </>
    );
  };

  const visitorGroups = (entries: VisitorEntry[]) => {
    const groups: Array<{
      key: string;
      head: VisitorEntry;
      others: VisitorEntry[];
    }> = [];
    const groupMap = new Map<string, number>();

    for (const entry of entries) {
      const key = visitorKey(entry);
      const index = groupMap.get(key);
      if (index != null) {
        groups[index].others.push(entry);
      } else {
        groups.push({ key, head: entry, others: [] });
        groupMap.set(key, groups.length - 1);
      }
    }

    return groups;
  };
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
              ) : error ? (
                <div className="ra-error">
                  Failed to load analytics: {error}
                  <button
                    type="button"
                    className="ra-retry"
                    onClick={loadStats}
                  >
                    Retry
                  </button>
                </div>
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
              ) : visitorsError ? (
                <div className="ra-error">
                  Failed to load visitors: {visitorsError}
                  <button
                    type="button"
                    className="ra-retry"
                    onClick={() => loadVisitors(0)}
                  >
                    Retry
                  </button>
                </div>
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
                      {visitorGroups(visitors).map((group) => (
                        <Fragment key={`${group.key}-${group.head.id}`}>
                          <tr key={`${group.key}-${group.head.id}`}>
                            <td>{formatTimestamp(group.head.created_at)}</td>
                            <td>
                              <span className="ra-ip">
                                {group.head.ip || "—"}
                              </span>
                            </td>
                            <td>
                              <span className="ra-visitor-user">
                                {renderVisitorUser(group.head)}
                                {group.others.length > 0 && (
                                  <span className="ra-visitor-group-badge">
                                    +{group.others.length} more
                                  </span>
                                )}
                              </span>
                            </td>
                          </tr>
                          {group.others.length > 0 && (
                            <tr key={`${group.key}-${group.head.id}-details`}>
                              <td
                                colSpan={3}
                                className="ra-visitor-group-details-cell"
                              >
                                <details className="ra-visitor-group-details">
                                  <summary>
                                    View {group.others.length} earlier visit
                                    {group.others.length > 1 ? "s" : ""}
                                  </summary>
                                  <div className="ra-visitor-group-list">
                                    {group.others.map((visit) => (
                                      <div
                                        className="ra-visitor-group-item"
                                        key={visit.id}
                                      >
                                        <span className="ra-visitor-group-time">
                                          {formatTimestamp(visit.created_at)}
                                        </span>
                                        <span className="ra-ip">
                                          {visit.ip || "—"}
                                        </span>
                                        <span>{visitorLabel(visit)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </td>
                            </tr>
                          )}
                        </Fragment>
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

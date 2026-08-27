import { BarChart3, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest } from "../../utils/api";
import { ContentStandOutCard } from "../cards/ContentStandOutCard";
import Select from "../ui/Select";
import CountUp from "../ui/CountUp/CountUp";
import "./ResourceAnalytics.css";

/* types */
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

interface Props {
  resource: "page" | "thread";
  resourceId: number;
  title?: string;
  onClose: () => void;
}

/* constants */
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

/* component */
export default function ResourceAnalytics({ resource, resourceId, title, onClose }: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  /* load overview stats */
  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<StatsResponse>(
        `/analytics/views/${resource}/${resourceId}?days=${days}`
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

  /* keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* derived */
  const chartColor = "var(--primary-color)";
  const daily = data?.daily ?? [];

  /* render */
  return (
    <div className="ra-overlay" onClick={onClose}>
      <ContentStandOutCard className="ra-panel" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="ra-header">
          <h3>
            <BarChart3 size={16} />
            {title
              ? `Analytics - ${title}`
              : `${resource === "page" ? "Page" : "Thread"} Analytics`}
          </h3>
          <button type="button" className="action-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="ra-body">
          {/* stat cards (always visible) */}
          {!loading && (
            <div className="ra-stats">
              <div className="ra-stat">
                <div className="ra-stat__value">
                  <CountUp to={data?.total_views ?? 0} direction="up" duration={1.5} />
                </div>
                <div className="ra-stat__label">Total Views</div>
              </div>
              <div className="ra-stat">
                <div className="ra-stat__value">
                  <CountUp to={data?.unique_viewers ?? 0} direction="up" duration={1.5} />
                </div>
                <div className="ra-stat__label">Unique Users</div>
              </div>
              <div className="ra-stat">
                <div className="ra-stat__value">
                  <CountUp to={data?.unique_ips ?? 0} direction="up" duration={1.5} />
                </div>
                <div className="ra-stat__label">Unique IPs</div>
              </div>
              <div className="ra-stat">
                <div className="ra-stat__value">
                  {daily.length > 0
                    ? Math.round(daily.reduce((sum, d) => sum + d.views, 0) / daily.length)
                    : 0}
                </div>
                <div className="ra-stat__label">Avg / Day</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="ra-loading">Loading analytics…</div>
          ) : error ? (
            <div className="ra-error">
              Failed to load analytics: {error}
              <button type="button" className="ra-retry" onClick={loadStats}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="ra-chart-header">
                <span>Views Over Time</span>
                <Select
                  className="ra-range-select"
                  value={String(days)}
                  options={RANGE_OPTIONS.map(opt => ({
                    value: String(opt.value),
                    label: opt.label,
                  }))}
                  onChange={e => setDays(Number(e.target.value))}
                />
              </div>
              <div className="ra-chart-wrap">
                {daily.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={daily}>
                      <defs>
                        <linearGradient id="viewGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
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
                        labelFormatter={label => new Date(label as string).toLocaleDateString()}
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
        </div>
      </ContentStandOutCard>
    </div>
  );
}

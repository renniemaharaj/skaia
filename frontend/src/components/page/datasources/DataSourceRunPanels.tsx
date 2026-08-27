import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Globe,
} from "lucide-react";
import Button from "../../ui/Button";
import type { DataSourceFetchLogEntry } from "./datasourcePreview";
import { DATA_SOURCE_EXIT_REASON_LABELS, type DataSourceRunStats } from "./editorTypes";

export function RunSummaryCard({ runStats }: { runStats: DataSourceRunStats }) {
  return (
    <div className="ds-run-summary">
      <div className="ds-run-summary__header">
        <span className="ds-run-summary__title">Run Summary</span>
        <span
          className={`ds-run-summary__status ds-run-summary__status--${
            runStats.exitReason === "success"
              ? "success"
              : runStats.exitReason === "timeout"
                ? "timeout"
                : "error"
          }`}
        >
          {runStats.exitReason === "success" ? (
            <CheckCircle2 size={11} />
          ) : (
            <AlertTriangle size={11} />
          )}
          {DATA_SOURCE_EXIT_REASON_LABELS[runStats.exitReason]}
        </span>
      </div>
      <div className="ds-run-summary__stats">
        <span className="ds-run-stat">
          <Clock size={11} />
          <strong>{runStats.duration}</strong>ms
        </span>
        {runStats.totalItems > 0 && (
          <span className="ds-run-stat">
            <Filter size={11} />
            <strong>{runStats.validItems}</strong>/{runStats.totalItems} valid
            {runStats.skippedItems > 0 && (
              <>
                {" "}
                (<strong className="ds-run-stat__skipped">{runStats.skippedItems}</strong> skipped)
              </>
            )}
          </span>
        )}
        <span className="ds-run-stat">
          <Globe size={11} />
          <strong>{runStats.fetchLog.length}</strong> outbound
        </span>
      </div>
    </div>
  );
}

export function FetchLogPanel({
  fetchLog,
  expandedFetch,
  onToggle,
}: {
  fetchLog: DataSourceFetchLogEntry[];
  expandedFetch: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="ds-fetch-log">
      <div className="ds-fetch-log__title">Outbound Requests</div>
      {fetchLog.map((entry, index) => {
        const expanded = expandedFetch.has(index);
        const statusOk = entry.status !== undefined && entry.status >= 200 && entry.status < 300;
        const statusWarn = entry.status !== undefined && entry.status >= 300 && entry.status < 400;
        return (
          <div key={`${entry.method}-${entry.url}-${index}`} className="ds-fetch-entry">
            <Button
              unstyled
              className="ds-fetch-entry__row"
              onClick={() => onToggle(index)}
              aria-expanded={expanded}
            >
              <span className="ds-fetch-entry__method">{entry.method}</span>
              <span className="ds-fetch-entry__url" title={entry.url}>
                {entry.url}
              </span>
              {entry.status !== undefined ? (
                <span
                  className={`ds-fetch-entry__status ${statusOk ? "ds-fetch-entry__status--ok" : statusWarn ? "ds-fetch-entry__status--warn" : "ds-fetch-entry__status--error"}`}
                >
                  {entry.status} {entry.statusText}
                </span>
              ) : entry.error ? (
                <span className="ds-fetch-entry__status ds-fetch-entry__status--error">Error</span>
              ) : null}
              {entry.duration !== undefined && (
                <span className="ds-fetch-entry__duration">{entry.duration}ms</span>
              )}
              {expanded ? (
                <ChevronDown size={13} className="ds-fetch-entry__chevron" />
              ) : (
                <ChevronRight size={13} className="ds-fetch-entry__chevron" />
              )}
            </Button>
            {expanded && entry.headers && Object.keys(entry.headers).length > 0 && (
              <div className="ds-fetch-entry__headers">
                {Object.entries(entry.headers).map(([key, value]) => (
                  <div key={key}>
                    <strong>{key}:</strong> {value}
                  </div>
                ))}
              </div>
            )}
            {expanded && entry.error && <div className="ds-fetch-entry__error">{entry.error}</div>}
          </div>
        );
      })}
    </div>
  );
}

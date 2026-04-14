import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LandingSection, LandingItem, DataSource } from "../types";
import "./DerivedSectionBlock.css";
import {
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  setSectionAnimation,
} from "../EditControls";
import { apiRequest } from "../../../utils/api";
import { AlertTriangle, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onItemUpdate: (item: LandingItem) => void;
  onItemDelete: (id: number) => void;
}

interface DerivedConfig {
  datasource_id?: number;
  columns?: number;
  layout?: string;
  auto_refresh?: boolean;
}

interface EvalItem {
  heading?: string;
  subheading?: string;
  icon?: string;
  image_url?: string;
  link_url?: string;
  config?: string;
}

function parseConfig(config: string): DerivedConfig {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

function updateConfig(config: string, updates: Partial<DerivedConfig>): string {
  try {
    const parsed = JSON.parse(config || "{}");
    return JSON.stringify({ ...parsed, ...updates });
  } catch {
    return JSON.stringify(updates);
  }
}

interface CompileResult {
  js: string;
  diagnostics: {
    line: number;
    col: number;
    message: string;
    category: number;
  }[];
}

/**
 * Compile TypeScript code via the backend, then evaluate the resulting JS.
 * The code should form the body of an async function that returns an array.
 * `fetch` is available in scope so the code can make API calls.
 */
async function evaluateDataSource(code: string): Promise<EvalItem[]> {
  // 1. Compile TS → JS via backend
  const compileRes = await apiRequest<CompileResult>(
    "/config/datasources/compile",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
  );

  const errors = (compileRes.diagnostics ?? []).filter((d) => d.category === 1);
  if (errors.length > 0) {
    throw new Error(
      errors.map((d) => `Line ${d.line}: ${d.message}`).join("\n"),
    );
  }

  // 2. Evaluate the compiled JS
  const fn = new Function(
    "fetch",
    `"use strict"; return (async () => { ${compileRes.js} })();`,
  );

  const result = await fn(fetch.bind(globalThis));
  if (!Array.isArray(result)) {
    throw new Error("Data source code must return an array");
  }
  return result as EvalItem[];
}

export const DerivedSectionBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const layout = getSectionLayout(section.config);
  const cfg = parseConfig(section.config);

  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [evaluatedItems, setEvaluatedItems] = useState<EvalItem[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [loadingDS, setLoadingDS] = useState(true);

  // Load available data sources
  useEffect(() => {
    apiRequest<DataSource[]>("/config/datasources")
      .then((list) => setDataSources(list ?? []))
      .catch(console.error)
      .finally(() => setLoadingDS(false));
  }, []);

  // Evaluate the selected data source
  const isAuthError = (message: string) =>
    /unauthorized|authentication|login required|401/i.test(message);

  const runEvaluation = useCallback(async () => {
    if (!cfg.datasource_id) {
      setEvaluatedItems([]);
      setEvalError(null);
      setAuthError(false);
      return;
    }
    setEvaluating(true);
    setEvalError(null);
    setAuthError(false);
    try {
      const ds = await apiRequest<DataSource>(
        `/config/datasources/${cfg.datasource_id}`,
      );
      const items = await evaluateDataSource(ds.code);
      setEvaluatedItems(items);
      toast.success(`Evaluated "${ds.name}" — ${items.length} item(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const auth = isAuthError(msg);
      setAuthError(auth);
      setEvalError(auth ? null : msg);
      setEvaluatedItems([]);
      toast.error(
        `Evaluation failed${auth ? ": authentication required" : ": " + msg}`,
      );
    } finally {
      setEvaluating(false);
    }
  }, [cfg.datasource_id]);

  // Auto-evaluate on datasource change
  useEffect(() => {
    if (cfg.datasource_id) {
      runEvaluation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.datasource_id]);

  const handleDatasourceChange = (dsId: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { datasource_id: dsId }),
    });
  };

  const handleColumnsChange = (cols: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { columns: cols }),
    });
  };

  const columns = cfg.columns ?? 3;
  const selectedDS = useMemo(
    () => dataSources.find((d) => d.id === cfg.datasource_id),
    [dataSources, cfg.datasource_id],
  );

  return (
    <section className="derived-section-block">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Derived Section"
          layout={layout}
          onLayoutChange={(l) =>
            onUpdate({
              ...section,
              config: setSectionLayout(section.config, l),
            })
          }
          margins={getSectionMargins(section.config)}
          onMarginsChange={(m) =>
            onUpdate({
              ...section,
              config: setSectionMargins(section.config, m),
            })
          }
          animation={getSectionAnimation(section.config)}
          onAnimationChange={(a) =>
            onUpdate({
              ...section,
              config: setSectionAnimation(section.config, a),
            })
          }
          extra={
            <button
              className="pb-section-toolbar-btn"
              onClick={runEvaluation}
              disabled={evaluating || !cfg.datasource_id}
              title="Re-evaluate data source"
            >
              <RefreshCw size={14} className={evaluating ? "spin" : ""} />
              {evaluating ? " Running…" : " Refresh"}
            </button>
          }
        />
      )}

      {/* Controls bar */}
      {canEdit && (
        <div className="derived-section-controls">
          <label className="derived-section-control">
            <span>Data Source</span>
            {loadingDS ? (
              <span>Loading…</span>
            ) : (
              <select
                value={cfg.datasource_id ?? ""}
                onChange={(e) => handleDatasourceChange(Number(e.target.value))}
              >
                <option value="">— Select a data source —</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="derived-section-control">
            <span>Columns</span>
            <select
              value={columns}
              onChange={(e) => handleColumnsChange(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {selectedDS && (
            <span className="derived-section-ds-info">
              <Zap size={14} /> {selectedDS.name}
            </span>
          )}
        </div>
      )}

      <div className="derived-section-frame">
        {!authError && evalError && (
          <div className="derived-section-error">
            <AlertTriangle size={16} />
            <span>{evalError}</span>
          </div>
        )}

        {authError && (
          <div className="derived-section-protected">
            <div className="derived-section-protected__content">
              <AlertTriangle size={24} />
              <div>
                <strong>Protected content</strong>
                <p>This section requires authentication to view.</p>
                <Link to="/login" className="derived-section-protected__link">
                  Sign in to continue
                </Link>
              </div>
            </div>
          </div>
        )}

        {evaluating && (
          <div className="derived-section-loading">
            <Loader2 size={24} className="spin" />
            <span>Evaluating data source…</span>
          </div>
        )}

        {/* No data source selected */}
        {!cfg.datasource_id && !canEdit && (
          <div className="derived-section-empty">
            <p>No data source configured.</p>
          </div>
        )}

        {/* Rendered cards */}
        {!authError && evaluatedItems.length > 0 && (
          <div
            className="derived-section-grid"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {evaluatedItems.map((item, i) => (
              <div key={i} className="derived-section-card">
                {item.image_url && (
                  <div className="derived-section-card-image">
                    <img src={item.image_url} alt={item.heading ?? ""} />
                  </div>
                )}
                <div className="derived-section-card-body">
                  {item.icon && (
                    <span className="derived-section-card-icon">
                      {item.icon}
                    </span>
                  )}
                  {item.heading && (
                    <h3 className="derived-section-card-heading">
                      {item.heading}
                    </h3>
                  )}
                  {item.subheading && (
                    <p className="derived-section-card-subheading">
                      {item.subheading}
                    </p>
                  )}
                </div>
                {item.link_url && (
                  <a
                    href={item.link_url}
                    className="derived-section-card-link"
                    target={
                      item.link_url.startsWith("http") ? "_blank" : undefined
                    }
                    rel={
                      item.link_url.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty result (after evaluation) */}
        {!evaluating &&
          !authError &&
          !evalError &&
          cfg.datasource_id &&
          evaluatedItems.length === 0 && (
            <div className="derived-section-empty">
              <p>Data source returned no items.</p>
            </div>
          )}
      </div>
    </section>
  );
};

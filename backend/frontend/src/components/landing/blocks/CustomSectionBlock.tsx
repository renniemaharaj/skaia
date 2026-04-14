import { useCallback, useEffect, useMemo, useState } from "react";
import "./CustomSectionBlock.css";
import type {
  LandingSection,
  LandingItem,
  DataSource,
  CustomSection,
  PreviewType,
} from "../types";
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

interface CustomSectionConfig {
  custom_section_id?: number;
  columns?: number;
  layout?: string;
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

interface EvalItem {
  heading?: string;
  subheading?: string;
  icon?: string;
  image_url?: string;
  link_url?: string;
  [key: string]: unknown;
}

function parseConfig(config: string): CustomSectionConfig {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

function updateConfig(
  config: string,
  updates: Partial<CustomSectionConfig>,
): string {
  try {
    const parsed = JSON.parse(config || "{}");
    return JSON.stringify({ ...parsed, ...updates });
  } catch {
    return JSON.stringify(updates);
  }
}

async function evaluateDataSource(code: string): Promise<EvalItem[]> {
  const compileRes = await apiRequest<CompileResult>(
    "/config/datasources/compile",
    { method: "POST", body: JSON.stringify({ code }) },
  );
  const errors = (compileRes.diagnostics ?? []).filter((d) => d.category === 1);
  if (errors.length > 0) {
    throw new Error(
      errors.map((d) => `Line ${d.line}: ${d.message}`).join("\n"),
    );
  }
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

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export const CustomSectionBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const layout = getSectionLayout(section.config);
  const cfg = parseConfig(section.config);

  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [evaluatedItems, setEvaluatedItems] = useState<EvalItem[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [sectionType, setSectionType] = useState<PreviewType>("cards");

  // Load available custom sections
  useEffect(() => {
    apiRequest<CustomSection[]>("/config/custom-sections")
      .then((list) => setCustomSections(list ?? []))
      .catch(console.error)
      .finally(() => setLoadingList(false));
  }, []);

  const selectedCS = useMemo(
    () => customSections.find((cs) => cs.id === cfg.custom_section_id),
    [customSections, cfg.custom_section_id],
  );

  // When the selected custom section changes, update the section type
  useEffect(() => {
    if (selectedCS) {
      setSectionType(selectedCS.section_type as PreviewType);
    }
  }, [selectedCS]);

  // Evaluate the selected custom section's datasource
  const runEvaluation = useCallback(async () => {
    if (!selectedCS) {
      setEvaluatedItems([]);
      setEvalError(null);
      return;
    }
    setEvaluating(true);
    setEvalError(null);
    try {
      const ds = await apiRequest<DataSource>(
        `/config/datasources/${selectedCS.datasource_id}`,
      );
      const items = await evaluateDataSource(ds.code);
      setEvaluatedItems(items);
      toast.success(`"${selectedCS.name}" — ${items.length} item(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEvalError(msg);
      setEvaluatedItems([]);
      toast.error("Evaluation failed: " + msg);
    } finally {
      setEvaluating(false);
    }
  }, [selectedCS]);

  // Auto-evaluate on custom section change
  useEffect(() => {
    if (cfg.custom_section_id) {
      runEvaluation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.custom_section_id]);

  const handleCSChange = (csId: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { custom_section_id: csId }),
    });
  };

  const columns = cfg.columns ?? 3;

  const handleColumnsChange = (cols: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { columns: cols }),
    });
  };

  // Auto-detect table columns
  const tableColumns = useMemo(() => {
    const keys = new Set<string>();
    evaluatedItems.forEach((item) => {
      Object.keys(item).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [evaluatedItems]);

  return (
    <section className="custom-section-block">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Custom Section"
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
              disabled={evaluating || !cfg.custom_section_id}
              title="Re-evaluate"
            >
              <RefreshCw size={14} className={evaluating ? "spin" : ""} />
              {evaluating ? " Running…" : " Refresh"}
            </button>
          }
        />
      )}

      {/* Controls bar */}
      {canEdit && (
        <div className="custom-section-controls">
          <label className="custom-section-control">
            <span>Custom Section</span>
            {loadingList ? (
              <span>Loading…</span>
            ) : (
              <select
                value={cfg.custom_section_id ?? ""}
                onChange={(e) => handleCSChange(Number(e.target.value))}
              >
                <option value="">— Select a saved section —</option>
                {customSections.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name} ({cs.section_type})
                  </option>
                ))}
              </select>
            )}
          </label>

          {sectionType !== "table" && (
            <label className="custom-section-control">
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
          )}

          {selectedCS && (
            <span className="custom-section-cs-info">
              <Zap size={14} /> {selectedCS.name}
            </span>
          )}
        </div>
      )}

      {/* Error display */}
      {evalError && (
        <div className="custom-section-error">
          <AlertTriangle size={16} />
          <span>{evalError}</span>
        </div>
      )}

      {/* Loading state */}
      {evaluating && (
        <div className="custom-section-loading">
          <Loader2 size={24} className="spin" />
          <span>Evaluating…</span>
        </div>
      )}

      {/* No section selected */}
      {!cfg.custom_section_id && !canEdit && (
        <div className="custom-section-empty">
          <p>No custom section configured.</p>
        </div>
      )}

      {/* Cards view */}
      {evaluatedItems.length > 0 && sectionType === "cards" && (
        <div
          className="custom-section-grid"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {evaluatedItems.map((item, i) => (
            <div key={i} className="custom-section-card">
              {item.image_url && (
                <div className="custom-section-card-image">
                  <img src={item.image_url} alt={item.heading ?? ""} />
                </div>
              )}
              <div className="custom-section-card-body">
                {item.icon && (
                  <span className="custom-section-card-icon">{item.icon}</span>
                )}
                {item.heading && (
                  <h3 className="custom-section-card-heading">
                    {item.heading}
                  </h3>
                )}
                {item.subheading && (
                  <p className="custom-section-card-subheading">
                    {item.subheading}
                  </p>
                )}
              </div>
              {item.link_url && (
                <a
                  href={item.link_url}
                  className="custom-section-card-link"
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

      {/* Stat Cards view */}
      {evaluatedItems.length > 0 && sectionType === "stat_cards" && (
        <div
          className="custom-section-stats-grid"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {evaluatedItems.map((item, i) => (
            <div key={i} className="custom-section-stat">
              {item.icon && (
                <span className="custom-section-stat-icon">{item.icon}</span>
              )}
              <div className="custom-section-stat-value">
                {item.heading ?? "—"}
              </div>
              <div className="custom-section-stat-label">
                {item.subheading ?? ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table view */}
      {evaluatedItems.length > 0 && sectionType === "table" && (
        <div className="custom-section-table-wrap">
          <div className="custom-section-table-container">
            <table className="custom-section-table">
              <thead>
                <tr>
                  {tableColumns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evaluatedItems.map((item, i) => (
                  <tr key={i}>
                    {tableColumns.map((col) => (
                      <td key={col}>{formatCellValue(item[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty result */}
      {!evaluating &&
        !evalError &&
        cfg.custom_section_id &&
        evaluatedItems.length === 0 && (
          <div className="custom-section-empty">
            <p>Section returned no items.</p>
          </div>
        )}
    </section>
  );
};

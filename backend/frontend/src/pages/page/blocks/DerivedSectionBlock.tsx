import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  LandingSection,
  LandingItem,
  DataSource,
  ColumnMap,
  FactTableConfig,
  CardTemplate,
} from "../types";
import { DEFAULT_CARD_TEMPLATE } from "../types";
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
import { ColumnMapper } from "../ColumnMapper";
import { mapRowsToItems, detectColumns } from "../mapRows";
import type { RawRow } from "../mapRows";
import { apiRequest } from "../../../utils/api";
import { AlertTriangle, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

import { DesignedCardGrid } from "./DesignedCardGrid";
import { CardDesigner } from "../CardDesigner";

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onItemUpdate: (item: LandingItem) => void;
  onItemDelete: (id: number) => void;
}

function parseConfig(config: string): FactTableConfig {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

function updateConfig(
  config: string,
  updates: Partial<FactTableConfig>,
): string {
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
  cached?: boolean;
}

async function evaluateDataSource(
  datasourceId: number,
): Promise<{ rows: RawRow[]; cached: boolean }> {
  const compileRes = await apiRequest<CompileResult>(
    `/config/datasources/${datasourceId}/compile`,
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
  return { rows: result as RawRow[], cached: compileRes.cached ?? false };
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
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [compileCached, setCompileCached] = useState<boolean | null>(null);
  const [loadingDS, setLoadingDS] = useState(true);

  // Load available data sources
  useEffect(() => {
    apiRequest<DataSource[]>("/config/datasources")
      .then((list) => setDataSources(list ?? []))
      .catch(console.error)
      .finally(() => setLoadingDS(false));
  }, []);

  const isAuthError = (message: string) =>
    /unauthorized|authentication|login required|401/i.test(message);

  const runEvaluation = useCallback(async () => {
    if (!cfg.datasource_id) {
      setRawRows([]);
      setEvalError(null);
      setAuthError(false);
      return;
    }
    setEvaluating(true);
    setEvalError(null);
    setAuthError(false);
    setCompileCached(null);
    try {
      const { rows, cached } = await evaluateDataSource(cfg.datasource_id);
      setRawRows(rows);
      setCompileCached(cached);
      toast.success(`Evaluated data source — ${rows.length} row(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const auth = isAuthError(msg);
      setAuthError(auth);
      setEvalError(auth ? null : msg);
      setRawRows([]);
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

  // Detect available columns from raw rows
  const availableColumns = useMemo(() => detectColumns(rawRows), [rawRows]);

  // Build LandingItem[] from raw rows + column map + overrides
  const mappedItems: LandingItem[] = useMemo(() => {
    if (!cfg.column_map || rawRows.length === 0) return [];
    return mapRowsToItems(
      rawRows,
      cfg.column_map,
      section.id,
      cfg.row_overrides,
      cfg.row_key_column,
    );
  }, [
    rawRows,
    cfg.column_map,
    cfg.row_overrides,
    cfg.row_key_column,
    section.id,
  ]);

  // Config updaters
  const handleDatasourceChange = (dsId: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { datasource_id: dsId }),
    });
  };

  const handleColumnMapChange = (columnMap: ColumnMap) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { column_map: columnMap }),
    });
  };

  const handleRowKeyColumnChange = (col: string) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, {
        row_key_column: col || undefined,
      }),
    });
  };

  const handleCardTemplateChange = (card_template: CardTemplate) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { card_template }),
    });
  };

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

          {availableColumns.length > 0 && (
            <label className="derived-section-control">
              <span>Row Key</span>
              <select
                value={cfg.row_key_column ?? ""}
                onChange={(e) => handleRowKeyColumnChange(e.target.value)}
              >
                <option value="">— index —</option>
                {availableColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedDS && (
            <span className="derived-section-ds-info">
              <Zap size={14} /> {selectedDS.name}
            </span>
          )}
        </div>
      )}

      {/* Column mapping UI */}
      {canEdit && availableColumns.length > 0 && (
        <ColumnMapper
          availableColumns={availableColumns}
          columnMap={cfg.column_map ?? {}}
          onChange={handleColumnMapChange}
        />
      )}

      {/* Card designer */}
      {canEdit && availableColumns.length > 0 && (
        <CardDesigner
          template={cfg.card_template ?? DEFAULT_CARD_TEMPLATE}
          onChange={handleCardTemplateChange}
        />
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

        {compileCached !== null && (
          <div
            style={{
              fontSize: "0.85rem",
              color: "#6b7280",
              marginBottom: "0.75rem",
            }}
          >
            {compileCached ? "Cached result" : "Fresh compilation"}
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
        {!authError && mappedItems.length > 0 && (
          <DesignedCardGrid
            items={mappedItems}
            template={cfg.card_template ?? DEFAULT_CARD_TEMPLATE}
          />
        )}

        {/* Empty result (after evaluation) */}
        {!evaluating &&
          !authError &&
          !evalError &&
          cfg.datasource_id &&
          rawRows.length === 0 && (
            <div className="derived-section-empty">
              <p>Data source returned no items.</p>
            </div>
          )}

        {/* Has rows but no column map configured */}
        {!evaluating &&
          !authError &&
          !evalError &&
          rawRows.length > 0 &&
          mappedItems.length === 0 &&
          canEdit && (
            <div className="derived-section-empty">
              <p>
                Configure the column mapping above to map datasource rows to
                card fields.
              </p>
            </div>
          )}
      </div>
    </section>
  );
};

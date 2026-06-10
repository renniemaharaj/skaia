import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  PageSection,
  PageItem,
  DataSource,
  ColumnMap,
  FactTableConfig,
  CardTemplate,
  ComponentDefinition,
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
  getSectionAnimationIntensity,
  setSectionAnimation,
  setSectionAnimationIntensity,
} from "../EditControls";
import { ColumnMapper } from "../ColumnMapper";
import { mapRowsToItems, detectColumns } from "../mapRows";
import type { RawRow } from "../mapRows";
import { apiRequest } from "../../../utils/api";
import { AlertTriangle, Loader2, RefreshCw, Zap, ExternalLink } from "lucide-react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { formatTimeAgo, cacheTTLLabel } from "../../../utils/cache";

import { DesignedCardGrid } from "./DesignedCardGrid";
import { CardDesigner } from "../CardDesigner";
import { ComponentBindMapper } from "../ComponentBindMapper";
import { ComponentGrid } from "../ComponentRenderer";
import { ActiveJobsBadge } from "../../../components/mediascraper/ActiveJobsBadge";
import { ComponentGroupRenderer } from "../ComponentGroupEditor";

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (s: PageSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<PageItem, "id">) => void;
  onItemUpdate: (item: PageItem) => void;
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

interface ExecuteResult {
  data: RawRow[] | null;
  diagnostics: {
    line: number;
    col: number;
    message: string;
    category: number;
  }[];
  error?: string;
  cached_at?: string;
  cache_ttl?: number;
}

const isAuthError = (message: string) =>
  /unauthorized|authentication|login required|401/i.test(message);

async function evaluateDataSource(
  datasourceId: number,
  envData?: string,
): Promise<{ rows: RawRow[]; cachedAt: Date; cacheTTL: number }> {
  const execRes = await apiRequest<ExecuteResult>(
    `/config/datasources/${datasourceId}/execute`,
    {
      method: "POST",
      body: JSON.stringify({ env_data: envData ?? "" }),
    },
  );
  if (execRes.error) {
    throw new Error(execRes.error);
  }
  if (!Array.isArray(execRes.data)) {
    throw new Error("Data source code must return an array");
  }
  return {
    rows: execRes.data as RawRow[],
    cachedAt: execRes.cached_at ? new Date(execRes.cached_at) : new Date(),
    cacheTTL: execRes.cache_ttl ?? 0,
  };
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
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [dsCacheTTL, setDsCacheTTL] = useState(0);
  const [loadingDS, setLoadingDS] = useState(true);
  const [componentsList, setComponentsList] = useState<ComponentDefinition[]>(
    [],
  );
  const [loadingComponents, setLoadingComponents] = useState(true);
  const datasourceSelectId = `derived-datasource-${section.id}`;
  const rowKeySelectId = `derived-row-key-${section.id}`;
  const componentSelectId = `derived-component-${section.id}`;

  // Load available data sources
  useEffect(() => {
    apiRequest<DataSource[]>("/config/datasources")
      .then((list) => setDataSources(list ?? []))
      .catch(console.error)
      .finally(() => setLoadingDS(false));
  }, []);

  useEffect(() => {
    apiRequest<ComponentDefinition[]>("/config/components")
      .then((list) => setComponentsList(list ?? []))
      .catch(console.error)
      .finally(() => setLoadingComponents(false));
  }, []);

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
    setLastRunAt(null);
    try {
      const { rows, cachedAt, cacheTTL } = await evaluateDataSource(
        cfg.datasource_id,
      );
      setRawRows(rows);
      setCompileCached(true);
      setLastRunAt(cachedAt);
      setDsCacheTTL(cacheTTL);
      toast.success(`Evaluated data source — ${rows.length} row(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const auth = isAuthError(msg);
      setAuthError(auth);
      setEvalError(auth ? null : msg);
      setRawRows([]);
      toast.error(
        `Evaluation failed${auth ? ": authentication required" : `: ${msg}`}`,
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
  }, [cfg.datasource_id, runEvaluation]);

  // Detect available columns from raw rows
  const availableColumns = useMemo(() => detectColumns(rawRows), [rawRows]);

  // Build PageItem[] from raw rows + column map + overrides
  const mappedItems: PageItem[] = useMemo(() => {
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

  const handleComponentChange = (componentType: string) => {
    const component = componentsList.find((c) => c.type === componentType);
    onUpdate({
      ...section,
      config: updateConfig(section.config, {
        component_type: componentType || undefined,
        component_version: component?.version,
        bindings: {},
      }),
    });
  };

  const handleBindingsChange = (bindings: Record<string, string>) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { bindings }),
    });
  };

  const selectedDS = useMemo(
    () => dataSources.find((d) => d.id === cfg.datasource_id),
    [dataSources, cfg.datasource_id],
  );
  const selectedComponent = useMemo(
    () => componentsList.find((c) => c.type === cfg.component_type),
    [componentsList, cfg.component_type],
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
          animationIntensity={getSectionAnimationIntensity(section.config)}
          onAnimationIntensityChange={(i) =>
            onUpdate({
              ...section,
              config: setSectionAnimationIntensity(section.config, i),
            })
          }
          extra={
            <button
              type="button"
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
          <label
            className="derived-section-control"
            htmlFor={datasourceSelectId}
          >
            <span>Data Source</span>
            {loadingDS ? (
              <span>Loading…</span>
            ) : (
              <select
                id={datasourceSelectId}
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
            <label className="derived-section-control" htmlFor={rowKeySelectId}>
              <span>Row Key</span>
              <select
                id={rowKeySelectId}
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
            <span className="derived-section-ds-info" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Zap size={14} /> {selectedDS.name}
              <Link 
                to={`/admin/datasources/${selectedDS.id}`} 
                target="_blank" 
                title="Edit Data Source"
                style={{ color: "var(--accent-color)", display: "flex" }}
              >
                <ExternalLink size={14} />
              </Link>
            </span>
          )}

          {availableColumns.length > 0 && (
            <label
              className="derived-section-control"
              htmlFor={componentSelectId}
            >
              <span>Component</span>
              {loadingComponents ? (
                <span>Loading…</span>
              ) : (
                <select
                  id={componentSelectId}
                  value={cfg.component_type ?? ""}
                  onChange={(e) => handleComponentChange(e.target.value)}
                >
                  <option value="">— Designed cards —</option>
                  {componentsList
                    .filter((component) => component.repeatable)
                    .map((component) => (
                      <option key={component.type} value={component.type}>
                        {component.label}
                      </option>
                    ))}
                </select>
              )}
            </label>
          )}
        </div>
      )}

      {canEdit && availableColumns.length > 0 && selectedComponent && (
        <ComponentBindMapper
          availableColumns={availableColumns}
          component={selectedComponent}
          bindings={cfg.bindings ?? {}}
          onChange={handleBindingsChange}
        />
      )}

      {/* Column mapping UI */}
      {canEdit && availableColumns.length > 0 && !selectedComponent && (
        <ColumnMapper
          availableColumns={availableColumns}
          columnMap={cfg.column_map ?? {}}
          onChange={handleColumnMapChange}
        />
      )}

      {/* Card designer */}
      {canEdit && availableColumns.length > 0 && !selectedComponent && (
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

        {compileCached !== null && lastRunAt && (
          <div className="ds-last-updated" style={{ marginRight: "10px" }}>
            <Clock size={11} />
            <span>Updated {formatTimeAgo(lastRunAt)}</span>
            {dsCacheTTL > 0 && (
              <span className="ds-last-updated__cache-badge">
                {cacheTTLLabel(dsCacheTTL)}
              </span>
            )}
          </div>
        )}

        {(selectedComponent?.type === "compound.mediascraper" || cfg.component_group?.items.some((c) => c.component_type === "compound.mediascraper")) && (
          <ActiveJobsBadge />
        )}

        {evaluating && (
          <div className="derived-section-loading">
            <Loader2 size={24} className="spin" />
            <span>Evaluating…</span>
          </div>
        )}

        {!evaluating && !cfg.datasource_id && (
          <div className="derived-section-empty">
            <p>No data source configured.</p>
          </div>
        )}

        {/* Rendered cards */}
        {!authError && selectedComponent && rawRows.length > 0 && (
          <div style={{ position: "relative" }}>
            <ComponentGrid
              component={selectedComponent}
              bindings={cfg.bindings ?? {}}
              rows={rawRows}
              styleOverrides={cfg.style_overrides}
            />
          </div>
        )}

        {!authError && cfg.component_group && rawRows.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: cfg.component_group.gap, marginTop: "16px", alignItems: "flex-start", position: "relative" }}>
            {rawRows.map((row, i) => (
              <ComponentGroupRenderer
                key={i}
                group={cfg.component_group!}
                components={componentsList}
                row={row}
              />
            ))}
          </div>
        )}

        {!authError && !selectedComponent && !cfg.component_group && mappedItems.length > 0 && (
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
          canEdit &&
          !selectedComponent &&
          !cfg.component_group && (
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

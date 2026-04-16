import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./CustomSectionBlock.css";
import type {
  LandingSection,
  LandingItem,
  DataSource,
  CustomSection,
  ColumnMap,
  FactTableConfig,
} from "../types";
import { DEFAULT_CARD_TEMPLATE } from "../types";
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

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
  onItemCreate: (sectionId: number, item: Omit<LandingItem, "id">) => void;
  onItemUpdate: (item: LandingItem) => void;
  onItemDelete: (id: number) => void;
}

interface CustomSectionConfig extends FactTableConfig {
  custom_section_id?: number;
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

async function evaluateDataSource(code: string): Promise<RawRow[]> {
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
  return result as RawRow[];
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
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const isAuthError = (message: string) =>
    /unauthorized|authentication|login required|401/i.test(message);

  // Load available custom sections
  useEffect(() => {
    setAuthError(false);
    apiRequest<CustomSection[]>("/config/custom-sections")
      .then((list) => setCustomSections(list ?? []))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (isAuthError(msg)) {
          setAuthError(true);
        }
        console.error(err);
      })
      .finally(() => setLoadingList(false));
  }, []);

  const selectedCS = useMemo(
    () => customSections.find((cs) => cs.id === cfg.custom_section_id),
    [customSections, cfg.custom_section_id],
  );

  // Evaluate the selected custom section's datasource
  const runEvaluation = useCallback(async () => {
    if (!selectedCS) {
      setRawRows([]);
      setEvalError(null);
      setAuthError(false);
      return;
    }
    setEvaluating(true);
    setEvalError(null);
    setAuthError(false);
    try {
      const ds = await apiRequest<DataSource>(
        `/config/datasources/${selectedCS.datasource_id}`,
      );
      const rows = await evaluateDataSource(ds.code);
      setRawRows(rows);
      toast.success(`"${selectedCS.name}" — ${rows.length} row(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const auth = isAuthError(msg);
      setAuthError(auth);
      setEvalError(auth ? null : msg);
      setRawRows([]);
      toast.error(
        "Evaluation failed" + (auth ? ": authentication required" : ": " + msg),
      );
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

  // Detect available columns from raw rows
  const availableColumns = useMemo(() => detectColumns(rawRows), [rawRows]);

  // Determine render type
  const hasColumnMap = cfg.column_map && Object.keys(cfg.column_map).length > 0;

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

  // Build LandingItem[] from raw rows + column map + overrides
  const handleCSChange = (csId: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { custom_section_id: csId }),
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

  // Determine if we're in legacy table mode (no column map, section_type = "table")
  const isLegacyTable = selectedCS?.section_type === "table" && !hasColumnMap;

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

          {availableColumns.length > 0 && !isLegacyTable && (
            <label className="custom-section-control">
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

          {selectedCS && (
            <span className="custom-section-cs-info">
              <Zap size={14} /> {selectedCS.name}
            </span>
          )}
        </div>
      )}

      {/* Column mapping UI */}
      {canEdit && availableColumns.length > 0 && !isLegacyTable && (
        <ColumnMapper
          availableColumns={availableColumns}
          columnMap={cfg.column_map ?? {}}
          onChange={handleColumnMapChange}
        />
      )}

      <div className="custom-section-frame">
        {/* Error display */}
        {!authError && evalError && (
          <div className="custom-section-error">
            <AlertTriangle size={16} />
            <span>{evalError}</span>
          </div>
        )}

        {authError && (
          <div className="custom-section-protected">
            <div className="custom-section-protected__content">
              <AlertTriangle size={24} />
              <div>
                <strong>Protected content</strong>
                <p>This section requires authentication to view.</p>
                <Link to="/login" className="custom-section-protected__link">
                  Sign in to continue
                </Link>
              </div>
            </div>
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

        {/* Rendered cards (column-mapped) */}
        {!authError && hasColumnMap && mappedItems.length > 0 && (
          <DesignedCardGrid
            items={mappedItems}
            template={cfg.card_template ?? DEFAULT_CARD_TEMPLATE}
          />
        )}

        {/* Has rows but no column map — prompt to configure */}
        {!evaluating &&
          !authError &&
          !evalError &&
          rawRows.length > 0 &&
          mappedItems.length === 0 &&
          !isLegacyTable &&
          canEdit && (
            <div className="custom-section-empty">
              <p>
                Configure the column mapping above to map datasource rows to
                card fields.
              </p>
            </div>
          )}

        {/* Empty result */}
        {!evaluating &&
          !authError &&
          !evalError &&
          cfg.custom_section_id &&
          rawRows.length === 0 && (
            <div className="custom-section-empty">
              <p>Section returned no items.</p>
            </div>
          )}
      </div>
    </section>
  );
};

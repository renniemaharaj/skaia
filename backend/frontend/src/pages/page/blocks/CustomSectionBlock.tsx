import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import "./CustomSectionBlock.css";
import type {
  LandingSection,
  LandingItem,
  CustomSection,
  ColumnMap,
  FactTableConfig,
  CardTemplate,
  CardZone,
} from "../types";
import { DEFAULT_CARD_TEMPLATE } from "../types";
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
import { AlertTriangle, Loader2, RefreshCw, Zap } from "lucide-react";
import { Clock } from "lucide-react";
import { toast } from "sonner";

import { DesignedCardGrid } from "./DesignedCardGrid";
import { formatTimeAgo, cacheTTLLabel } from "../../../utils/cache";

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

function getStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

function coerceHeading(row: RawRow): string | undefined {
  return (
    getStringValue(row.heading) ||
    getStringValue(row.title) ||
    getStringValue(row.name)
  );
}

function coerceSubheading(row: RawRow): string | undefined {
  return (
    getStringValue(row.subheading) ||
    getStringValue(row.description) ||
    getStringValue(row.subtitle)
  );
}

function coerceImageUrl(row: RawRow): string | undefined {
  return getStringValue(row.image_url) || getStringValue(row.image);
}

function coerceLinkUrl(row: RawRow): string | undefined {
  return (
    getStringValue(row.link_url) ||
    getStringValue(row.url) ||
    getStringValue(row.link)
  );
}

function coerceIcon(row: RawRow): string | undefined {
  return getStringValue(row.icon);
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function TablePreview({
  rows,
  columns,
  template,
}: {
  rows: RawRow[];
  columns: string[];
  template: CardTemplate;
}) {
  const tableClass = [
    "custom-section-table",
    template.tableBordered ? "custom-section-table--bordered" : "",
    template.tableCompact ? "custom-section-table--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const zoneMap = Object.fromEntries(
    template.zones.map((zone) => [zone.field, zone]),
  ) as Record<string, CardZone>;

  const getColumnStyle = (col: string): CSSProperties => {
    const zone = zoneMap[col];
    return {
      textAlign: zone?.align ?? "left",
      fontSize: zone
        ? zone.size === "sm"
          ? "0.85rem"
          : zone.size === "lg"
            ? "1.05rem"
            : "0.95rem"
        : undefined,
    };
  };

  const containerStyle: React.CSSProperties = {
    margin: `${template.marginTop ?? 0}px ${template.marginRight ?? 0}px ${template.marginBottom ?? 0}px ${template.marginLeft ?? 0}px`,
    padding: `${template.paddingTop ?? 0}px ${template.paddingRight ?? 16}px ${template.paddingBottom ?? 16}px ${template.paddingLeft ?? 16}px`,
  };

  return (
    <div className="custom-section-table-wrap" style={containerStyle}>
      {template.customCss ? <style>{template.customCss}</style> : null}
      <div className="custom-section-table-container dtable--custom-css">
        <table className={tableClass}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} style={getColumnStyle(col)}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td key={col} style={getColumnStyle(col)}>
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [compileCached, setCompileCached] = useState<boolean | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [dscacheTTL, setDsCacheTTL] = useState(0);
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
    () => customSections.find((cs) => cs.id === Number(cfg.custom_section_id)),
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
    setCompileCached(null);
    setLastRunAt(null);
    try {
      const { rows, cachedAt, cacheTTL } = await evaluateDataSource(
        selectedCS.datasource_id,
      );
      setRawRows(rows);
      setCompileCached(true);
      setLastRunAt(cachedAt);
      setDsCacheTTL(cacheTTL);
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

  // Auto-evaluate once the selected custom section is available
  useEffect(() => {
    if (cfg.custom_section_id && selectedCS) {
      runEvaluation();
    }
  }, [cfg.custom_section_id, selectedCS, runEvaluation]);

  // Detect available columns from raw rows
  const availableColumns = useMemo(() => detectColumns(rawRows), [rawRows]);

  const selectedCSConfig = useMemo<FactTableConfig>(() => {
    if (!selectedCS) return {};
    try {
      return JSON.parse(selectedCS.config || "{}");
    } catch {
      return {};
    }
  }, [selectedCS]);

  const effectiveTemplate = useMemo<CardTemplate>(() => {
    return (
      cfg.card_template ??
      selectedCSConfig.card_template ??
      DEFAULT_CARD_TEMPLATE
    );
  }, [cfg.card_template, selectedCSConfig.card_template]);

  const hasColumnMap = cfg.column_map && Object.keys(cfg.column_map).length > 0;

  const previewItems: LandingItem[] = useMemo(() => {
    if (
      !selectedCS ||
      rawRows.length === 0 ||
      hasColumnMap ||
      selectedCS.section_type === "table"
    ) {
      return [];
    }

    return rawRows
      .map((row, index) => {
        const heading = coerceHeading(row);
        const subheading = coerceSubheading(row);
        if (!heading || !subheading) return null;

        return {
          id: -(index + 1),
          section_id: section.id,
          display_order: index + 1,
          icon: coerceIcon(row) ?? "",
          heading,
          subheading,
          image_url: coerceImageUrl(row) ?? "",
          link_url: coerceLinkUrl(row) ?? "",
          config: "{}",
        } as LandingItem;
      })
      .filter((item): item is LandingItem => item !== null);
  }, [rawRows, selectedCS, hasColumnMap, section.id]);

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
          animationIntensity={getSectionAnimationIntensity(section.config)}
          onAnimationIntensityChange={(i) =>
            onUpdate({
              ...section,
              config: setSectionAnimationIntensity(section.config, i),
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

        {compileCached !== null && lastRunAt && (
          <div className="ds-last-updated">
            <Clock size={11} />
            <span>Updated {formatTimeAgo(lastRunAt)}</span>
            {dscacheTTL > 0 && (
              <span className="ds-last-updated__cache-badge">
                {cacheTTLLabel(dscacheTTL)}
              </span>
            )}
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
          <DesignedCardGrid items={mappedItems} template={effectiveTemplate} />
        )}

        {/* Render saved custom section preview items */}
        {!authError &&
          !hasColumnMap &&
          selectedCS?.section_type !== "table" &&
          previewItems.length > 0 && (
            <DesignedCardGrid
              items={previewItems}
              template={effectiveTemplate}
            />
          )}

        {/* Render table preview for saved table custom sections */}
        {!authError &&
          !hasColumnMap &&
          selectedCS?.section_type === "table" &&
          rawRows.length > 0 && (
            <TablePreview
              rows={rawRows}
              columns={availableColumns}
              template={effectiveTemplate}
            />
          )}

        {/* Has rows but no column map — prompt to configure */}
        {!evaluating &&
          !authError &&
          !evalError &&
          rawRows.length > 0 &&
          !hasColumnMap &&
          selectedCS &&
          selectedCS.section_type !== "table" &&
          previewItems.length === 0 && (
            <div className="custom-section-empty">
              <p>
                Saved custom section returned rows, but no display fields were
                found. Ensure the datasource produces heading/subheading or add
                a column mapping.
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

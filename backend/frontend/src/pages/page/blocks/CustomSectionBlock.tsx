import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./CustomSectionBlock.css";
import type {
  LandingSection,
  LandingItem,
  DataSource,
  CustomSection,
  ColumnMap,
  RenderableSectionType,
  FactTableConfig,
  MappableField,
  CardTemplate,
} from "../types";
import {
  RENDERABLE_SECTION_TYPES,
  RENDERABLE_TYPE_LABELS,
  DEFAULT_CARD_TEMPLATE,
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
import { ColumnMapper } from "../ColumnMapper";
import { mapRowsToItems, detectColumns, rowKey } from "../mapRows";
import type { RawRow } from "../mapRows";
import { apiRequest } from "../../../utils/api";
import { AlertTriangle, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

// Block components we delegate rendering to
import { CardGroupBlock } from "./CardGroupBlock";
import { FeatureGridBlock } from "./FeatureGridBlock";
import { StatCardsBlock } from "./StatCardsBlock";
import { EventHighlightsBlock } from "./EventHighlightsBlock";
import { ImageCardGrid } from "./ImageCardGrid";
import type { ImageCardItem } from "./ImageCardGrid";
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

  // Determine render type — use column_map if present, else fall back to legacy
  const hasColumnMap = cfg.column_map && Object.keys(cfg.column_map).length > 0;
  const renderAs: RenderableSectionType = cfg.render_as ?? "card_group";

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

  // Virtual section with the mapped items
  const virtualSection: LandingSection = useMemo(
    () => ({ ...section, items: mappedItems }),
    [section, mappedItems],
  );

  // Handle item updates → store as row overrides
  const handleItemUpdate = useCallback(
    (item: LandingItem) => {
      const idx = -(item.id + 1);
      if (idx < 0 || idx >= rawRows.length) return;

      const key = rowKey(rawRows[idx], idx, cfg.row_key_column);
      const currentOverrides = cfg.row_overrides ?? {};
      const rowOverride = currentOverrides[key] ?? {};

      const baseItem = mappedItems.find((m) => m.id === item.id);
      if (!baseItem) return;

      const fields: MappableField[] = [
        "heading",
        "subheading",
        "icon",
        "image_url",
        "link_url",
      ];
      const newOverride = { ...rowOverride };
      for (const f of fields) {
        if (item[f] !== baseItem[f]) {
          newOverride[f] = item[f];
        }
      }

      onUpdate({
        ...section,
        config: updateConfig(section.config, {
          row_overrides: { ...currentOverrides, [key]: newOverride },
        }),
      });
    },
    [
      rawRows,
      cfg.row_key_column,
      cfg.row_overrides,
      mappedItems,
      section,
      onUpdate,
    ],
  );

  // Config updaters
  const handleCSChange = (csId: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { custom_section_id: csId }),
    });
  };

  const handleRenderAsChange = (ra: RenderableSectionType) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { render_as: ra }),
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

  // Auto-detect table columns (for legacy table fallback)
  const tableColumns = useMemo(() => {
    const keys = new Set<string>();
    rawRows.forEach((row) => {
      Object.keys(row).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [rawRows]);

  // Render the delegate block when column mapping is active
  const renderDelegateBlock = () => {
    if (mappedItems.length === 0) return null;

    const noop = () => {};
    switch (renderAs) {
      case "card_group":
        return (
          <CardGroupBlock
            section={virtualSection}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => {}}
            onItemCreate={noop}
            onItemUpdate={handleItemUpdate}
            onItemDelete={noop}
          />
        );
      case "feature_grid":
        return (
          <FeatureGridBlock
            section={virtualSection}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => {}}
            onItemCreate={noop}
            onItemUpdate={handleItemUpdate}
            onItemDelete={noop}
          />
        );
      case "stat_cards":
        return (
          <StatCardsBlock
            section={virtualSection}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => {}}
            onItemCreate={noop}
            onItemUpdate={handleItemUpdate}
            onItemDelete={noop}
          />
        );
      case "event_highlights":
        return (
          <EventHighlightsBlock
            section={virtualSection}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => {}}
            onItemCreate={noop}
            onItemUpdate={handleItemUpdate}
            onItemDelete={noop}
          />
        );
      case "image_cards": {
        const imageItems: ImageCardItem[] = mappedItems.map((item) => ({
          heading: item.heading || undefined,
          subheading: item.subheading || undefined,
          image_url: item.image_url || undefined,
          icon: item.icon || undefined,
          link_url: item.link_url || undefined,
        }));
        return <ImageCardGrid items={imageItems} />;
      }
      case "designed_card": {
        const tmpl = cfg.card_template ?? DEFAULT_CARD_TEMPLATE;
        return <DesignedCardGrid items={mappedItems} template={tmpl} />;
      }
      default:
        return null;
    }
  };

  // Legacy table rendering (no column map needed)
  const renderLegacyTable = () => {
    if (rawRows.length === 0 || tableColumns.length === 0) return null;
    return (
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
              {rawRows.map((item, i) => (
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
    );
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

          {!isLegacyTable && (
            <label className="custom-section-control">
              <span>Render As</span>
              <select
                value={renderAs}
                onChange={(e) =>
                  handleRenderAsChange(e.target.value as RenderableSectionType)
                }
              >
                {RENDERABLE_SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RENDERABLE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          )}

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

      {/* Card designer UI (designed_card mode only) */}
      {canEdit && renderAs === "designed_card" && !isLegacyTable && (
        <CardDesigner
          template={cfg.card_template ?? DEFAULT_CARD_TEMPLATE}
          onChange={handleCardTemplateChange}
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

        {/* Rendered via real block component (column-mapped) */}
        {!authError && hasColumnMap && renderDelegateBlock()}

        {/* Legacy table view (no column map) */}
        {!authError && isLegacyTable && renderLegacyTable()}

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

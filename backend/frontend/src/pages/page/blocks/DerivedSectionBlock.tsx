import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  LandingSection,
  LandingItem,
  DataSource,
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
    try {
      const ds = await apiRequest<DataSource>(
        `/config/datasources/${cfg.datasource_id}`,
      );
      const rows = await evaluateDataSource(ds.code);
      setRawRows(rows);
      toast.success(`Evaluated "${ds.name}" — ${rows.length} row(s)`);
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

  // Build a virtual section with the mapped items for the delegate block
  const virtualSection: LandingSection = useMemo(
    () => ({
      ...section,
      items: mappedItems,
    }),
    [section, mappedItems],
  );

  // Handle item updates from the delegate block → store as row overrides
  const handleItemUpdate = useCallback(
    (item: LandingItem) => {
      // Identify which row this item came from using its synthetic index
      const idx = -(item.id + 1); // reverse the -(index+1) encoding
      if (idx < 0 || idx >= rawRows.length) return;

      const key = rowKey(rawRows[idx], idx, cfg.row_key_column);
      const currentOverrides = cfg.row_overrides ?? {};
      const rowOverride = currentOverrides[key] ?? {};

      // Diff the item against the mapped base to find what was changed
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
  const handleDatasourceChange = (dsId: number) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { datasource_id: dsId }),
    });
  };

  const handleRenderAsChange = (renderAs: RenderableSectionType) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { render_as: renderAs }),
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

  const renderAs = cfg.render_as ?? "card_group";

  // Render the delegate block
  const renderDelegateBlock = () => {
    if (mappedItems.length === 0) return null;

    // Noop handlers for create/delete (datasource-driven items aren't manually added/removed)
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

      {/* Card designer UI (designed_card mode only) */}
      {canEdit && renderAs === "designed_card" && (
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

        {/* Rendered via real block component */}
        {!authError && renderDelegateBlock()}

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

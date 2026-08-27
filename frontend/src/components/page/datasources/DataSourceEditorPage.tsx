import {
  AlignCenterHorizontal,
  ArrowLeft,
  Code2,
  LayoutGrid,
  Loader2,
  Maximize2,
  MoveVertical,
  Play,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { apiRequest } from "../../../utils/api";
import Button from "../../ui/Button";
import { SkeletonContent, SkeletonPrimitive } from "../../ui/Skeleton";
import Select from "../../ui/Select";
import { customConfirm } from "../../ui/Prompt";
import { ComponentGroupEditor } from "../ComponentGroupEditor";
import { EventHookEditor } from "../EventHookEditor";
import TabbedEditor from "../TabbedEditor";
import type {
  ComponentDefinition,
  ComponentGroup,
  CustomSection,
  DataSource,
  EventHook,
} from "../types";
import {
  type DataSourceDiagnostic,
  type DataSourceFetchLogEntry,
  runDatasourcePreview,
} from "./datasourcePreview";
import { DataSourceResultsPanel, type DataSourceResultPanel } from "./DataSourceResultsPanel";
import {
  DEFAULT_DATASOURCE_CODE,
  type DataSourcePreviewItem,
  type DataSourceRunStats,
} from "./editorTypes";
import "./DataSources.css";

import { CACHE_TTL_OPTIONS } from "../../../utils/cache";

export default function DataSourceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({
    "main.ts": DEFAULT_DATASOURCE_CODE,
  });
  const [envData, setEnvData] = useState("");
  const [cacheTTL, setCacheTTL] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Compile/evaluate state
  const [compiling, setCompiling] = useState(false);
  const [compiledJS, setCompiledJS] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [diagnostics, setDiagnostics] = useState<DataSourceDiagnostic[]>([]);
  const [previewItems, setPreviewItems] = useState<DataSourcePreviewItem[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [runStats, setRunStats] = useState<DataSourceRunStats | null>(null);
  const [expandedFetch, setExpandedFetch] = useState<Set<number>>(new Set());

  const tableColumns = useMemo(() => {
    const keys = new Set<string>();
    previewItems.forEach(item => {
      Object.keys(item).forEach(key => keys.add(key));
    });
    return Array.from(keys);
  }, [previewItems]);

  // Active panel on the right
  const [activePanel, setActivePanel] = useState<DataSourceResultPanel>("preview");

  type LayoutMode = "default" | "wide" | "center";
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("default");
  const [heightMode, setHeightMode] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  // Save as custom section
  const [showSaveSection, setShowSaveSection] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [sectionDesc, setSectionDesc] = useState("");
  const [savingSection, setSavingSection] = useState(false);
  const [savedSections, setSavedSections] = useState<CustomSection[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);

  const [componentsList, setComponentsList] = useState<ComponentDefinition[]>([]);
  const [componentGroup, setComponentGroup] = useState<ComponentGroup>({
    items: [],
    gap: 16,
    max_width: 800,
  });
  const [componentHooks, setComponentHooks] = useState<EventHook[]>([]);
  const [componentWorkspace, setComponentWorkspace] = useState(false);

  useEffect(() => {
    apiRequest<ComponentDefinition[]>("/config/components")
      .then(setComponentsList)
      .catch(console.error);
  }, []);

  const applySavedSection = useCallback(
    (section: CustomSection) => {
      let config: {
        component_group?: ComponentGroup;
        event_hooks?: EventHook[];
      } = {};
      try {
        config = JSON.parse(section.config || "{}");
      } catch {
        toast.error(`Section "${section.name}" has invalid configuration`);
        return;
      }
      if (!config.component_group || !Array.isArray(config.component_group.items)) {
        toast.error(`Section "${section.name}" does not contain a component group`);
        return;
      }
      setComponentGroup(config.component_group);
      setComponentHooks(Array.isArray(config.event_hooks) ? config.event_hooks : []);
      setSectionName(section.name);
      setSectionDesc(section.description ?? "");
      setEditingSectionId(section.id);
      setShowSaveSection(false);
      setSearchParams(
        current => {
          const next = new URLSearchParams(current);
          next.set("preset", String(section.id));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const fetchSavedSections = useCallback(async () => {
    if (isNew || !id) return;
    try {
      const list = await apiRequest<CustomSection[]>(
        `/config/section-presets?datasource_id=${encodeURIComponent(id)}`
      );
      const sections = list ?? [];
      setSavedSections(sections);
      const requestedId = Number(searchParams.get("preset"));
      if (requestedId && requestedId !== editingSectionId) {
        const requested = sections.find(section => section.id === requestedId);
        if (requested) applySavedSection(requested);
      }
    } catch {
      toast.error("Failed to load saved sections");
    }
  }, [applySavedSection, editingSectionId, id, isNew, searchParams]);

  useEffect(() => {
    fetchSavedSections();
  }, [fetchSavedSections]);

  const startNewSectionDesign = () => {
    setEditingSectionId(null);
    setSectionName("");
    setSectionDesc("");
    setComponentGroup({ items: [], gap: 16, max_width: 800 });
    setComponentHooks([]);
    setShowSaveSection(false);
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("preset");
        return next;
      },
      { replace: true }
    );
  };

  const fetchDS = useCallback(async () => {
    if (isNew) return;
    try {
      const ds = await apiRequest<DataSource>(`/config/datasources/${id}`);
      setName(ds.name);
      setDescription(ds.description);
      setCacheTTL(ds.cache_ttl ?? 0);
      // Prefer files map; fall back to legacy code field
      if (ds.files && Object.keys(ds.files).length > 0) {
        setFiles(ds.files);
      } else {
        setFiles({ "main.ts": ds.code || DEFAULT_DATASOURCE_CODE });
      }
      // Fetch env data (returns empty for unauthorized users)
      try {
        const env = await apiRequest<{ env_data: string }>(`/config/datasources/${id}/env`);
        setEnvData(env.env_data ?? "");
      } catch {
        // not authorized or no env data - leave empty
      }
    } catch {
      toast.error("Data source not found");
      navigate("/datasources");
    } finally {
      setLoading(false);
    }
  }, [id, isNew, navigate]);

  useEffect(() => {
    fetchDS();
  }, [fetchDS]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        code: files["main.ts"] ?? "",
        files,
        cache_ttl: cacheTTL,
      };
      if (isNew) {
        const created = await apiRequest<DataSource>("/config/datasources", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Data source created");
        navigate(`/datasources/${created.id}`, { replace: true });
      } else {
        await apiRequest<DataSource>(`/config/datasources/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("Data source updated");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) return;
    if (
      !(await customConfirm({
        title: "Delete this data source?",
        body: "The data source will move to Trash. Dependent section presets stay hidden until it is restored.",
        confirmLabel: "Delete data source",
        destructive: true,
      }))
    )
      return;
    try {
      await apiRequest(`/config/datasources/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      navigate("/datasources");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleRun = async () => {
    setCompiling(true);
    setEvalError(null);
    setPreviewItems([]);
    setCompiledJS(null);
    setLastRunAt(null);
    setDiagnostics([]);
    setRunStats(null);
    setExpandedFetch(new Set());

    const startedAt = performance.now();
    let fetchLog: DataSourceFetchLogEntry[] = [];
    try {
      const result = await runDatasourcePreview(files, envData);
      fetchLog = result.fetch_log ?? [];
      setCompiledJS(result.js ?? null);
      setLastRunAt(new Date());
      setDiagnostics(result.diagnostics ?? []);

      const errors = (result.diagnostics ?? []).filter(d => d.category === 1);
      if (errors.length > 0) {
        setRunStats({
          duration: Math.round(performance.now() - startedAt),
          exitReason: "compile_error",
          totalItems: 0,
          validItems: 0,
          skippedItems: 0,
          fetchLog,
        });
        setEvalError(
          errors.map(d => `${d.file ? `${d.file} ` : ""}Line ${d.line}: ${d.message}`).join("\n")
        );
        setActivePanel("diagnostics");
        return;
      }

      if (result.error) {
        const msg = result.error;
        setRunStats({
          duration: Math.round(performance.now() - startedAt),
          exitReason: msg.includes("timed out") ? "timeout" : "runtime_error",
          totalItems: 0,
          validItems: 0,
          skippedItems: 0,
          fetchLog,
        });
        setEvalError(msg);
        setActivePanel("diagnostics");
        return;
      }

      const rawItems = result.data;

      if (!Array.isArray(rawItems)) {
        setRunStats({
          duration: Math.round(performance.now() - startedAt),
          exitReason: "invalid_return",
          totalItems: 0,
          validItems: 0,
          skippedItems: 0,
          fetchLog,
        });
        setEvalError("Code must return an array of objects");
        setActivePanel("diagnostics");
        return;
      }

      // Per-item validation and sanitization - skip bad entries, never throw
      const sanitized: DataSourcePreviewItem[] = [];
      let skippedItems = 0;
      for (const raw of rawItems as unknown[]) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          skippedItems++;
          continue;
        }
        const obj = raw as Record<string, unknown>;
        // Coerce heading from heading | title | name
        const heading =
          (typeof obj.heading === "string" && obj.heading.trim()) ||
          (typeof obj.title === "string" && obj.title.trim()) ||
          (typeof obj.name === "string" && obj.name.trim()) ||
          null;
        // Coerce subheading from subheading | description | subtitle
        const subheading =
          (typeof obj.subheading === "string" && obj.subheading.trim()) ||
          (typeof obj.description === "string" && obj.description.trim()) ||
          (typeof obj.subtitle === "string" && obj.subtitle.trim()) ||
          null;
        if (!heading || !subheading) {
          skippedItems++;
          continue;
        }
        const row: DataSourcePreviewItem = {
          ...obj,
          heading: heading ?? undefined,
          subheading: subheading ?? undefined,
          icon: typeof obj.icon === "string" ? obj.icon : undefined,
          image_url:
            typeof obj.image_url === "string"
              ? obj.image_url
              : typeof obj.image === "string"
                ? obj.image
                : undefined,
          link_url:
            typeof obj.link_url === "string"
              ? obj.link_url
              : typeof obj.url === "string"
                ? obj.url
                : typeof obj.link === "string"
                  ? obj.link
                  : undefined,
        };
        sanitized.push(row);
      }

      setRunStats({
        duration: Math.round(performance.now() - startedAt),
        exitReason: "success",
        totalItems: (rawItems as unknown[]).length,
        validItems: sanitized.length,
        skippedItems,
        fetchLog,
      });
      setPreviewItems(sanitized);
      setActivePanel("preview");
      if (skippedItems > 0) {
        toast.warning(
          `${sanitized.length} item(s) returned - ${skippedItems} skipped (missing heading/subheading)`
        );
      } else {
        toast.success(`${sanitized.length} item(s) returned`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRunStats({
        duration: Math.round(performance.now() - startedAt),
        exitReason: "runtime_error",
        totalItems: 0,
        validItems: 0,
        skippedItems: 0,
        fetchLog,
      });
      setEvalError(msg);
      setActivePanel("diagnostics");
    } finally {
      setCompiling(false);
    }
  };

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const mainCode = files["main.ts"] ?? "";
  const codeLineCount = mainCode.split("\n").length;
  const editorHeight = heightMode
    ? Math.max(400, Math.min(viewportHeight * 0.55, 700))
    : Math.max(400, Math.min(codeLineCount * 20 + 40, 700));

  const handleSaveSection = async () => {
    if (!sectionName.trim()) {
      toast.error("Section name is required");
      return;
    }
    setSavingSection(true);
    try {
      const payload = {
        name: sectionName,
        description: sectionDesc,
        datasource_id: Number(id),
        section_type: "component",
        config: JSON.stringify({
          columns: 1,
          component_group: componentGroup,
          event_hooks: componentHooks,
        }),
      };
      const saved = await apiRequest<CustomSection>(
        editingSectionId
          ? `/config/section-presets/${editingSectionId}`
          : "/config/section-presets",
        {
          method: editingSectionId ? "PUT" : "POST",
          body: JSON.stringify({
            ...payload,
          }),
        }
      );
      toast.success(`Section "${sectionName}" ${editingSectionId ? "updated" : "saved"}`);
      setEditingSectionId(saved.id);
      setShowSaveSection(false);
      await fetchSavedSections();
    } catch {
      toast.error("Failed to save section");
    } finally {
      setSavingSection(false);
    }
  };

  if (loading) {
    return (
      <div className="ds-editor-page">
        <SkeletonContent className="ds-editor__loading" label="Loading data source">
          <SkeletonPrimitive shape="heading" width="36%" />
          <SkeletonPrimitive height={42} />
          <SkeletonPrimitive height={280} />
        </SkeletonContent>
      </div>
    );
  }

  return (
    <div
      className={`ds-editor-page ${layoutMode !== "default" ? `ds-editor-page--${layoutMode}` : ""}`}
    >
      {/* Top bar */}
      <div className="ds-editor__topbar">
        <Button unstyled onClick={() => navigate("/datasources")} className="ds-editor__back-btn">
          <ArrowLeft size={16} /> Data Sources
        </Button>
        <div className="ds-editor__topbar-actions">
          <div className="ds-editor__layout-controls">
            <Button
              unstyled
              type="button"
              aria-pressed={layoutMode === "wide"}
              className={`ds-editor__layout-btn ${layoutMode === "wide" ? "active" : ""}`}
              onClick={() => setLayoutMode(prev => (prev === "wide" ? "default" : "wide"))}
              title="Wide focus mode"
              aria-label="Wide focus mode"
            >
              <Maximize2 size={16} />
            </Button>
            <Button
              unstyled
              type="button"
              aria-pressed={layoutMode === "center"}
              className={`ds-editor__layout-btn ${layoutMode === "center" ? "active" : ""}`}
              onClick={() => setLayoutMode(prev => (prev === "center" ? "default" : "center"))}
              title="Centered focus mode"
              aria-label="Centered focus mode"
            >
              <AlignCenterHorizontal size={16} />
            </Button>
            <Button
              unstyled
              type="button"
              aria-pressed={heightMode}
              className={`ds-editor__layout-btn ${heightMode ? "active" : ""}`}
              onClick={() => setHeightMode(prev => !prev)}
              title="Proportional height mode"
              aria-label="Proportional height mode"
            >
              <MoveVertical size={16} />
            </Button>
          </div>
          <Button
            unstyled
            className="ds-editor__run-btn"
            onClick={handleRun}
            disabled={compiling || !mainCode.trim()}
          >
            {compiling ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            {compiling ? "Running…" : "Run"}
          </Button>
          <Button unstyled className="ds-editor__save-btn" onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </Button>
          {!isNew && (
            <Button
              unstyled
              className="action-btn danger"
              onClick={handleDelete}
              title="Delete data source"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Meta fields */}
      <div className="ds-editor__meta">
        <div className="ds-editor__field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Recent forum threads"
          />
        </div>
        <div className="ds-editor__field">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What this data source produces"
          />
        </div>
        <div className="ds-editor__field ds-editor__field--cache">
          <label>Cache</label>
          <Select
            value={cacheTTL}
            onChange={e => setCacheTTL(Number(e.target.value))}
            className="ds-editor__cache-select"
            size="sm"
          >
            {CACHE_TTL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Main split view: Editor + Results */}
      <div className="ds-editor__split">
        {/* Left: Code editor */}
        <div
          className={`ds-editor__code-panel${componentWorkspace ? " ds-editor__code-panel--components" : ""}`}
        >
          <div className="ds-editor__panel-header">
            <div className="ds-editor__workspace-tabs" role="tablist" aria-label="Editor workspace">
              <Button
                unstyled
                type="button"
                role="tab"
                aria-selected={!componentWorkspace}
                className={`ds-editor__workspace-tab${!componentWorkspace ? " active" : ""}`}
                onClick={() => setComponentWorkspace(false)}
              >
                <Code2 size={14} /> Code
              </Button>
              <Button
                unstyled
                type="button"
                role="tab"
                aria-selected={componentWorkspace}
                className={`ds-editor__workspace-tab${componentWorkspace ? " active" : ""}`}
                onClick={() => setComponentWorkspace(true)}
                disabled={previewItems.length === 0}
              >
                <LayoutGrid size={14} /> Components
              </Button>
            </div>
            {!componentWorkspace && (
              <span className="ds-editor__line-count">{codeLineCount} lines</span>
            )}
          </div>
          {componentWorkspace ? (
            <div className="ds-editor__component-workspace" role="tabpanel">
              <ComponentGroupEditor
                group={componentGroup}
                components={componentsList}
                availableColumns={tableColumns}
                firstRow={previewItems[0] || null}
                onChange={setComponentGroup}
                workspaceMode
                showPreview={false}
              />
              <div className="ds-component-picker__hooks">
                <EventHookEditor hooks={componentHooks} onChange={setComponentHooks} />
              </div>
            </div>
          ) : (
            <div className="ds-editor__code-area" role="tabpanel">
              <TabbedEditor
                files={files}
                onFilesChange={setFiles}
                envData={envData}
                onEnvDataChange={setEnvData}
                datasourceId={isNew ? 0 : Number(id)}
                height={editorHeight}
              />
            </div>
          )}
        </div>

        {/* Right: Results panel */}
        <DataSourceResultsPanel
          activePanel={activePanel}
          onActivePanelChange={setActivePanel}
          previewItems={previewItems}
          diagnostics={diagnostics}
          compiledJS={compiledJS}
          evalError={evalError}
          runStats={runStats}
          expandedFetch={expandedFetch}
          onToggleFetch={index =>
            setExpandedFetch(previous => {
              const next = new Set(previous);
              if (next.has(index)) next.delete(index);
              else next.add(index);
              return next;
            })
          }
          lastRunAt={lastRunAt}
          cacheTTL={cacheTTL}
          isNew={isNew}
          savedSections={savedSections}
          editingSectionId={editingSectionId}
          onSelectSection={applySavedSection}
          onNewSection={startNewSectionDesign}
          showSaveSection={showSaveSection}
          onToggleSaveSection={() => setShowSaveSection(value => !value)}
          sectionName={sectionName}
          sectionDesc={sectionDesc}
          onSectionNameChange={setSectionName}
          onSectionDescChange={setSectionDesc}
          onCloseSaveSection={() => setShowSaveSection(false)}
          onSaveSection={handleSaveSection}
          savingSection={savingSection}
          componentWorkspace={componentWorkspace}
          componentGroup={componentGroup}
          componentsList={componentsList}
          tableColumns={tableColumns}
          componentHooks={componentHooks}
          setComponentGroup={setComponentGroup}
          setComponentWorkspace={setComponentWorkspace}
          setComponentHooks={setComponentHooks}
        />
      </div>
    </div>
  );
}

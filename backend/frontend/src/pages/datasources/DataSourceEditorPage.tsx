import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Play,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Code2,
  FileJson,
  Eye,
  LayoutGrid,
  BarChart3,
  Table2,
  Bookmark,
  X,
  Clock,
  Globe,
  ChevronDown,
  ChevronRight,
  Filter,
  Maximize2,
  AlignCenterHorizontal,
  MoveVertical,
  Paintbrush,
} from "lucide-react";
import { apiRequest } from "../../utils/api";
import type {
  DataSource,
  CustomSection,
  CardTemplate,
  CardZone,
} from "../page/types";
import { DesignedCardGrid } from "../page/blocks/DesignedCardGrid";
import { CardDesigner } from "../page/CardDesigner";
import { PREVIEW_TYPES, DEFAULT_CARD_TEMPLATE } from "../page/types";
import { toast } from "sonner";
import TabbedEditor from "../../components/page/TabbedEditor";
import "./DataSources.css";

interface CompileResult {
  js: string;
  diagnostics: {
    file: string;
    line: number;
    col: number;
    message: string;
    category: number;
  }[];
  cached?: boolean;
}

interface EvalItem {
  heading?: string;
  subheading?: string;
  icon?: string;
  image_url?: string;
  link_url?: string;
  [key: string]: unknown;
}

interface FetchLogEntry {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  duration?: number;
  error?: string;
}

interface RunStats {
  duration: number;
  exitReason:
    | "success"
    | "compile_error"
    | "runtime_error"
    | "invalid_return"
    | "timeout";
  totalItems: number;
  validItems: number;
  skippedItems: number;
  fetchLog: FetchLogEntry[];
}

const EVAL_TIMEOUT_MS = 15_000;

const EXIT_REASON_LABELS: Record<RunStats["exitReason"], string> = {
  success: "Success",
  compile_error: "Compile Error",
  runtime_error: "Runtime Error",
  invalid_return: "Invalid Return",
  timeout: "Timeout",
};

const DEFAULT_CODE = `// Return an array of items:
// { heading, subheading, icon?, image_url?, link_url? }

return [
  { heading: "Example", subheading: "Hello world" },
];
`;

import {
  CACHE_TTL_OPTIONS,
  formatTimeAgo,
  cacheTTLLabel,
} from "../../utils/cache";

const DATASOURCE_PREVIEW_TYPES = [
  ...PREVIEW_TYPES,
  "feature",
  "image",
  "designed_card",
] as const;

type DataSourcePreviewType = (typeof DATASOURCE_PREVIEW_TYPES)[number];

const DATASOURCE_PREVIEW_TYPE_LABELS: Record<DataSourcePreviewType, string> = {
  cards: "Cards",
  stat_cards: "Stats",
  table: "Table",
  feature: "Feature Grid",
  image: "Image Grid",
  designed_card: "Card Designer",
};

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS: Record<
  DataSourcePreviewType,
  CardTemplate
> = {
  cards: {
    ...DEFAULT_CARD_TEMPLATE,
    cardWidth: "regular",
    cardStyle: "default",
    imagePosition: "top",
    contentAlign: "start",
    gap: 12,
    gridGap: 24,
    zones: [
      { field: "image_url", align: "center", size: "lg", visible: true },
      { field: "icon", align: "center", size: "md", visible: false },
      { field: "heading", align: "left", size: "md", visible: true },
      { field: "subheading", align: "left", size: "sm", visible: true },
      { field: "link_url", align: "left", size: "sm", visible: false },
    ],
  },
  stat_cards: {
    ...DEFAULT_CARD_TEMPLATE,
    cardWidth: "narrow",
    cardStyle: "flat",
    imagePosition: "none",
    contentAlign: "stretch",
    gap: 8,
    gridGap: 20,
    borderRadius: 14,
    zones: [
      { field: "image_url", align: "center", size: "lg", visible: false },
      { field: "icon", align: "left", size: "md", visible: true },
      { field: "heading", align: "left", size: "md", visible: true },
      { field: "subheading", align: "left", size: "sm", visible: true },
      { field: "link_url", align: "left", size: "sm", visible: false },
    ],
  },
  feature: {
    ...DEFAULT_CARD_TEMPLATE,
    cardWidth: "narrow",
    cardStyle: "minimal",
    imagePosition: "none",
    contentAlign: "center",
    gap: 8,
    gridGap: 24,
    borderRadius: 16,
    zones: [
      { field: "image_url", align: "center", size: "lg", visible: false },
      { field: "icon", align: "center", size: "lg", visible: true },
      { field: "heading", align: "center", size: "md", visible: true },
      { field: "subheading", align: "center", size: "sm", visible: true },
      { field: "link_url", align: "center", size: "sm", visible: false },
    ],
  },
  image: {
    ...DEFAULT_CARD_TEMPLATE,
    cardWidth: "regular",
    cardStyle: "flat",
    imagePosition: "top",
    contentAlign: "start",
    gap: 10,
    gridGap: 24,
    zones: [
      { field: "image_url", align: "center", size: "lg", visible: true },
      { field: "icon", align: "center", size: "md", visible: false },
      { field: "heading", align: "left", size: "md", visible: true },
      { field: "subheading", align: "left", size: "sm", visible: true },
      { field: "link_url", align: "left", size: "sm", visible: false },
    ],
  },
  table: {
    ...DEFAULT_CARD_TEMPLATE,
    cardWidth: "full",
    cardStyle: "minimal",
    imagePosition: "none",
    contentAlign: "stretch",
    gap: 10,
    gridGap: 12,
    borderRadius: 10,
    zones: [
      { field: "image_url", align: "left", size: "lg", visible: false },
      { field: "icon", align: "left", size: "md", visible: false },
      { field: "heading", align: "left", size: "md", visible: true },
      { field: "subheading", align: "left", size: "sm", visible: true },
      { field: "link_url", align: "left", size: "sm", visible: false },
    ],
  },
  designed_card: {
    ...DEFAULT_CARD_TEMPLATE,
  },
};

export default function DataSourceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({
    "main.ts": DEFAULT_CODE,
  });
  const [envData, setEnvData] = useState("");
  const [cacheTTL, setCacheTTL] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Compile/evaluate state
  const [compiling, setCompiling] = useState(false);
  const [compiledJS, setCompiledJS] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [diagnostics, setDiagnostics] = useState<CompileResult["diagnostics"]>(
    [],
  );
  const [previewItems, setPreviewItems] = useState<EvalItem[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [expandedFetch, setExpandedFetch] = useState<Set<number>>(new Set());

  const tableColumns = useMemo(() => {
    const keys = new Set<string>();
    previewItems.forEach((item) => {
      Object.keys(item).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [previewItems]);

  // Active panel on the right
  type RightPanel = "preview" | "compiled" | "diagnostics";
  const [activePanel, setActivePanel] = useState<RightPanel>("preview");

  // Preview section type
  const [previewType, setPreviewType] =
    useState<DataSourcePreviewType>("cards");

  type LayoutMode = "default" | "wide" | "center";
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("default");
  const [heightMode, setHeightMode] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );

  // Save as custom section
  const [showSaveSection, setShowSaveSection] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [sectionDesc, setSectionDesc] = useState("");
  const [savingSection, setSavingSection] = useState(false);

  // Card designer templates for each preview mode.
  const [cardTemplates, setCardTemplates] = useState<
    Record<DataSourcePreviewType, CardTemplate>
  >(() => ({
    cards: DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS.cards,
    stat_cards: DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS.stat_cards,
    feature: DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS.feature,
    image: DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS.image,
    table: DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS.table,
    designed_card: DATASOURCE_PREVIEW_CARD_TEMPLATE_PRESETS.designed_card,
  }));

  const currentCardTemplate = cardTemplates[previewType];
  const handleCardTemplateChange = useCallback(
    (template: CardTemplate) => {
      setCardTemplates((prev) => ({
        ...prev,
        [previewType]: template,
      }));
    },
    [previewType],
  );

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
        setFiles({ "main.ts": ds.code || DEFAULT_CODE });
      }
      // Fetch env data (returns empty for unauthorized users)
      try {
        const env = await apiRequest<{ env_data: string }>(
          `/config/datasources/${id}/env`,
        );
        setEnvData(env.env_data ?? "");
      } catch {
        // not authorized or no env data — leave empty
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
    if (!confirm("Delete this data source?")) return;
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
    const fetchLog: FetchLogEntry[] = [];

    // Tracked fetch — logs every outbound request including status + headers
    const trackedFetch = async (
      input: string | Request | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const method = (
        init?.method ??
        (input instanceof Request ? (input as Request).method : "GET")
      ).toUpperCase();
      const entry: FetchLogEntry = { url, method };
      const t0 = performance.now();
      try {
        const resp = await fetch(input as RequestInfo, init);
        entry.status = resp.status;
        entry.statusText = resp.statusText;
        const hdrs: Record<string, string> = {};
        resp.headers.forEach((val, key) => {
          hdrs[key] = val;
        });
        entry.headers = hdrs;
        if (!resp.ok) {
          const clone = resp.clone();
          let bodyText = "";
          try {
            bodyText = await clone.text();
          } catch {
            bodyText = "";
          }
          entry.error = `HTTP ${resp.status} ${resp.statusText}${bodyText ? `: ${bodyText}` : ""}`;
        }
        entry.duration = Math.round(performance.now() - t0);
        fetchLog.push(entry);
        return resp;
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
        entry.duration = Math.round(performance.now() - t0);
        fetchLog.push(entry);
        throw e;
      }
    };

    try {
      const result = await apiRequest<CompileResult>(
        "/config/datasources/compile",
        { method: "POST", body: JSON.stringify({ files }) },
      );
      setCompiledJS(result.js);
      setLastRunAt(new Date());
      setDiagnostics(result.diagnostics ?? []);

      const errors = (result.diagnostics ?? []).filter((d) => d.category === 1);
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
          errors
            .map(
              (d) =>
                `${d.file ? d.file + " " : ""}Line ${d.line}: ${d.message}`,
            )
            .join("\n"),
        );
        setActivePanel("diagnostics");
        return;
      }

      // Parse .env data into key-value pairs for sandbox injection
      const parsedEnv: Record<string, string> = {};
      for (const line of envData.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        parsedEnv[key] = val;
      }
      const envKeys = Object.keys(parsedEnv);
      const envValues = Object.values(parsedEnv);

      // Evaluate compiled JS with timeout and intercepted fetch + env vars
      const fn = new Function(
        "fetch",
        "env",
        ...envKeys,
        `"use strict"; return (async () => { ${result.js} })();`,
      );
      let rawItems: unknown;
      try {
        rawItems = await Promise.race([
          fn(trackedFetch, Object.freeze({ ...parsedEnv }), ...envValues),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Execution timed out after ${EVAL_TIMEOUT_MS / 1000}s`,
                  ),
                ),
              EVAL_TIMEOUT_MS,
            ),
          ),
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
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

      // Per-item validation and sanitization — skip bad entries, never throw
      const sanitized: EvalItem[] = [];
      let skippedItems = 0;
      const isTablePreview = previewType === "table";
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
        if (!isTablePreview && (!heading || !subheading)) {
          skippedItems++;
          continue;
        }
        const row: EvalItem = {
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
          `${sanitized.length} item(s) returned — ${skippedItems} skipped (missing heading/subheading)`,
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

  // Issues tab badge
  const issuesBadgeCount =
    diagnostics.filter((d) => d.category === 1).length +
    (runStats?.skippedItems ?? 0);
  const hasIssues =
    issuesBadgeCount > 0 ||
    !!evalError ||
    (runStats != null && runStats.exitReason !== "success");

  const handleSaveSection = async () => {
    if (!sectionName.trim()) {
      toast.error("Section name is required");
      return;
    }
    setSavingSection(true);
    try {
      await apiRequest<CustomSection>("/config/custom-sections", {
        method: "POST",
        body: JSON.stringify({
          name: sectionName,
          description: sectionDesc,
          datasource_id: Number(id),
          section_type: previewType,
          config: JSON.stringify({
            columns: 3,
            card_template: currentCardTemplate,
          }),
        }),
      });
      toast.success(`Section "${sectionName}" saved`);
      setShowSaveSection(false);
      setSectionName("");
      setSectionDesc("");
    } catch {
      toast.error("Failed to save section");
    } finally {
      setSavingSection(false);
    }
  };

  if (loading) {
    return (
      <div className="ds-editor-page">
        <div className="ds-editor__loading">
          <Loader2 size={24} className="spin" />
          <span>Loading data source…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`ds-editor-page ${layoutMode !== "default" ? `ds-editor-page--${layoutMode}` : ""}`}
    >
      {/* Top bar */}
      <div className="ds-editor__topbar">
        <button
          onClick={() => navigate("/datasources")}
          className="ds-editor__back-btn"
        >
          <ArrowLeft size={16} /> Data Sources
        </button>
        <div className="ds-editor__topbar-actions">
          <div className="ds-editor__layout-controls">
            <button
              type="button"
              aria-pressed={layoutMode === "wide"}
              className={`icon-btn icon-btn--md ds-editor__layout-btn ${layoutMode === "wide" ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() =>
                setLayoutMode((prev) => (prev === "wide" ? "default" : "wide"))
              }
              title="Wide focus mode"
              aria-label="Wide focus mode"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              aria-pressed={layoutMode === "center"}
              className={`icon-btn icon-btn--md ds-editor__layout-btn ${layoutMode === "center" ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() =>
                setLayoutMode((prev) =>
                  prev === "center" ? "default" : "center",
                )
              }
              title="Centered focus mode"
              aria-label="Centered focus mode"
            >
              <AlignCenterHorizontal size={16} />
            </button>
            <button
              type="button"
              aria-pressed={heightMode}
              className={`icon-btn icon-btn--md ds-editor__layout-btn ${heightMode ? "icon-btn--active" : "icon-btn--subtle"}`}
              onClick={() => setHeightMode((prev) => !prev)}
              title="Proportional height mode"
              aria-label="Proportional height mode"
            >
              <MoveVertical size={16} />
            </button>
          </div>
          <button
            className="ds-editor__run-btn"
            onClick={handleRun}
            disabled={compiling || !mainCode.trim()}
          >
            {compiling ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Play size={14} />
            )}
            {compiling ? "Running…" : "Run"}
          </button>
          <button
            className="ds-editor__save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </button>
          {!isNew && (
            <button
              className="icon-btn icon-btn--md icon-btn--outlined icon-btn--danger"
              onClick={handleDelete}
              title="Delete data source"
            >
              <Trash2 size={14} />
            </button>
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
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Recent forum threads"
          />
        </div>
        <div className="ds-editor__field">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this data source produces"
          />
        </div>
        <div className="ds-editor__field ds-editor__field--cache">
          <label>Cache</label>
          <select
            value={cacheTTL}
            onChange={(e) => setCacheTTL(Number(e.target.value))}
            className="ds-editor__cache-select"
          >
            {CACHE_TTL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main split view: Editor + Results */}
      <div className="ds-editor__split">
        {/* Left: Code editor */}
        <div className="ds-editor__code-panel">
          <div className="ds-editor__panel-header">
            <Code2 size={14} />
            <span>TypeScript</span>
            <span className="ds-editor__line-count">{codeLineCount} lines</span>
          </div>
          <div className="ds-editor__code-area">
            <TabbedEditor
              files={files}
              onFilesChange={setFiles}
              envData={envData}
              onEnvDataChange={setEnvData}
              datasourceId={isNew ? 0 : Number(id)}
              height={editorHeight}
            />
          </div>
        </div>

        {/* Right: Results panel */}
        <div className="ds-editor__results-panel">
          <div className="ds-editor__panel-tabs">
            <button
              className={`ds-editor__tab ${activePanel === "preview" ? "ds-editor__tab--active" : ""}`}
              onClick={() => setActivePanel("preview")}
            >
              <Eye size={13} /> Preview
              {previewItems.length > 0 && (
                <span className="ds-editor__tab-badge">
                  {previewItems.length}
                </span>
              )}
            </button>
            <button
              className={`ds-editor__tab ${activePanel === "compiled" ? "ds-editor__tab--active" : ""}`}
              onClick={() => setActivePanel("compiled")}
            >
              <FileJson size={13} /> Compiled JS
            </button>
            <button
              className={`ds-editor__tab ${activePanel === "diagnostics" ? "ds-editor__tab--active" : ""}`}
              onClick={() => setActivePanel("diagnostics")}
            >
              <AlertTriangle size={13} /> Issues
              {hasIssues && (
                <span className="ds-editor__tab-badge ds-editor__tab-badge--warn">
                  {issuesBadgeCount || "!"}
                </span>
              )}
            </button>

            {lastRunAt && (
              <div className="ds-editor__last-updated">
                <Clock size={11} />
                <span>Updated {formatTimeAgo(lastRunAt)}</span>
                {cacheTTL > 0 && (
                  <span className="ds-editor__cache-badge">
                    {cacheTTLLabel(cacheTTL)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="ds-editor__panel-content">
            {/* Preview */}
            {activePanel === "preview" && (
              <div className="ds-editor__preview">
                {/* Preview type selector + save section */}
                {previewItems.length > 0 && (
                  <div className="ds-preview__toolbar">
                    <div className="ds-preview__type-tabs">
                      {DATASOURCE_PREVIEW_TYPES.map((type) => (
                        <button
                          key={type}
                          className={`ds-preview__type-tab ${previewType === type ? "ds-preview__type-tab--active" : ""}`}
                          onClick={() => setPreviewType(type)}
                        >
                          {type === "cards" && <LayoutGrid size={13} />}
                          {type === "feature" && <BarChart3 size={13} />}
                          {type === "image" && <Table2 size={13} />}
                          {type === "stat_cards" && <BarChart3 size={13} />}
                          {type === "table" && <Table2 size={13} />}
                          {type === "designed_card" && <Paintbrush size={13} />}
                          {DATASOURCE_PREVIEW_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                    {!isNew && (
                      <button
                        className="ds-preview__save-section-btn"
                        onClick={() => setShowSaveSection((v) => !v)}
                      >
                        <Bookmark size={13} /> Save as Section
                      </button>
                    )}
                  </div>
                )}

                {/* Save as section form */}
                {showSaveSection && (
                  <SaveAsSectionForm
                    sectionName={sectionName}
                    sectionDesc={sectionDesc}
                    onSectionNameChange={setSectionName}
                    onSectionDescChange={setSectionDesc}
                    previewType={previewType}
                    onClose={() => setShowSaveSection(false)}
                    onSubmit={handleSaveSection}
                    saving={savingSection}
                    isNew={isNew}
                  />
                )}

                {runStats && <RunSummaryCard runStats={runStats} />}

                {runStats && runStats.fetchLog.length > 0 && (
                  <FetchLogPanel
                    fetchLog={runStats.fetchLog}
                    expandedFetch={expandedFetch}
                    onToggle={(i) =>
                      setExpandedFetch((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                )}

                {previewItems.length === 0 && !evalError && (
                  <div className="ds-editor__preview-empty">
                    <Play size={32} />
                    <p>
                      Click "Run" to evaluate the data source and preview
                      results.
                    </p>
                  </div>
                )}
                {evalError && (
                  <div className="ds-editor__error">
                    <AlertTriangle size={16} />
                    <pre>{evalError}</pre>
                  </div>
                )}

                {previewItems.length > 0 && (
                  <CardDesigner
                    template={currentCardTemplate}
                    onChange={handleCardTemplateChange}
                    mode={previewType === "table" ? "table" : "card"}
                  />
                )}

                {previewItems.length > 0 && previewType === "table" && (
                  <TablePreview
                    items={previewItems}
                    columns={tableColumns}
                    template={currentCardTemplate}
                  />
                )}

                {previewItems.length > 0 && previewType !== "table" && (
                  <DesignedCardGrid
                    items={previewItems.map((item, index) => ({
                      id: -(index + 1),
                      section_id: 0,
                      display_order: index + 1,
                      icon: item.icon ?? "",
                      heading: item.heading ?? "",
                      subheading: item.subheading ?? "",
                      image_url: item.image_url ?? "",
                      link_url: item.link_url ?? "",
                      config: "{}",
                    }))}
                    template={currentCardTemplate}
                  />
                )}
              </div>
            )}

            {/* Compiled JS */}
            {activePanel === "compiled" && (
              <div className="ds-editor__compiled">
                {compiledJS ? (
                  <pre className="ds-editor__compiled-code">{compiledJS}</pre>
                ) : (
                  <div className="ds-editor__preview-empty">
                    <FileJson size={32} />
                    <p>
                      Run the data source to see compiled JavaScript output.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Diagnostics */}
            {activePanel === "diagnostics" && (
              <div className="ds-editor__diagnostics">
                {/* Empty state — only before first run */}
                {!runStats && diagnostics.length === 0 && !evalError && (
                  <div className="ds-editor__preview-empty">
                    <CheckCircle2 size={32} />
                    <p>No issues. Run the data source to check for errors.</p>
                  </div>
                )}

                {/* Run Summary */}
                {runStats && <RunSummaryCard runStats={runStats} />}

                {/* Fetch Log */}
                {runStats && runStats.fetchLog.length > 0 && (
                  <FetchLogPanel
                    fetchLog={runStats.fetchLog}
                    expandedFetch={expandedFetch}
                    onToggle={(i) =>
                      setExpandedFetch((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                )}

                {/* Error */}
                {evalError && (
                  <div className="ds-editor__error">
                    <AlertTriangle size={16} />
                    <pre>{evalError}</pre>
                  </div>
                )}

                {/* TypeScript Diagnostics */}
                {diagnostics.map((d, i) => (
                  <div
                    key={i}
                    className={`ds-diagnostic ${d.category === 1 ? "ds-diagnostic--error" : "ds-diagnostic--warn"}`}
                  >
                    <span className="ds-diagnostic__location">
                      {d.file ? `${d.file} ` : ""}Ln {d.line}, Col {d.col}
                    </span>
                    <span className="ds-diagnostic__message">{d.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TablePreview({
  items,
  columns,
  template,
}: {
  items: EvalItem[];
  columns: string[];
  template: CardTemplate;
}) {
  const tableClass = [
    "ds-table",
    template.tableBordered ? "ds-table--bordered" : "",
    template.tableCompact ? "ds-table--compact" : "",
    !template.tableStriped ? "ds-table--no-stripes" : "",
    !template.tableHover ? "ds-table--no-hover" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const zoneMap = Object.fromEntries(
    template.zones.map((zone) => [zone.field, zone]),
  ) as Record<string, CardZone>;

  const getColumnStyle = (col: string): CSSProperties => {
    const zone = zoneMap[col];
    const style: CSSProperties = {
      textAlign: zone?.align ?? "left",
    };
    if (zone) {
      style.fontSize =
        zone.size === "sm"
          ? "0.85rem"
          : zone.size === "lg"
            ? "1.05rem"
            : "0.95rem";
    }
    return style;
  };

  const containerStyle: React.CSSProperties = {
    margin: `${template.marginTop ?? 0}px ${template.marginRight ?? 0}px ${template.marginBottom ?? 0}px ${template.marginLeft ?? 0}px`,
    padding: `${template.paddingTop ?? 0}px ${template.paddingRight ?? 16}px ${template.paddingBottom ?? 16}px ${template.paddingLeft ?? 16}px`,
  };

  return (
    <div className="ds-table-wrap" style={containerStyle}>
      {template.customCss ? <style>{template.customCss}</style> : null}
      <div className="ds-table-container dtable--custom-css">
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
            {items.map((item, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td key={col} style={getColumnStyle(col)}>
                    {formatCellValue(item[col])}
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

// ── Sub-components ────────────────────────────────────────────────────────────

function RunSummaryCard({ runStats }: { runStats: RunStats }) {
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
          {EXIT_REASON_LABELS[runStats.exitReason]}
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
                (
                <strong style={{ color: "#f59e0b" }}>
                  {runStats.skippedItems}
                </strong>{" "}
                skipped)
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

function FetchLogPanel({
  fetchLog,
  expandedFetch,
  onToggle,
}: {
  fetchLog: FetchLogEntry[];
  expandedFetch: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="ds-fetch-log">
      <div className="ds-fetch-log__title">Outbound Requests</div>
      {fetchLog.map((entry, i) => {
        const expanded = expandedFetch.has(i);
        const statusOk =
          entry.status !== undefined &&
          entry.status >= 200 &&
          entry.status < 300;
        const statusWarn =
          entry.status !== undefined &&
          entry.status >= 300 &&
          entry.status < 400;
        return (
          <div key={i} className="ds-fetch-entry">
            <div className="ds-fetch-entry__row" onClick={() => onToggle(i)}>
              <span className="ds-fetch-entry__method">{entry.method}</span>
              <span className="ds-fetch-entry__url" title={entry.url}>
                {entry.url}
              </span>
              {entry.status !== undefined ? (
                <span
                  className={`ds-fetch-entry__status ${
                    statusOk
                      ? "ds-fetch-entry__status--ok"
                      : statusWarn
                        ? "ds-fetch-entry__status--warn"
                        : "ds-fetch-entry__status--error"
                  }`}
                >
                  {entry.status} {entry.statusText}
                </span>
              ) : entry.error ? (
                <span className="ds-fetch-entry__status ds-fetch-entry__status--error">
                  Error
                </span>
              ) : null}
              {entry.duration !== undefined && (
                <span className="ds-fetch-entry__duration">
                  {entry.duration}ms
                </span>
              )}
              {expanded ? (
                <ChevronDown
                  size={13}
                  style={{ flexShrink: 0, color: "var(--text-secondary)" }}
                />
              ) : (
                <ChevronRight
                  size={13}
                  style={{ flexShrink: 0, color: "var(--text-secondary)" }}
                />
              )}
            </div>
            {expanded &&
              entry.headers &&
              Object.keys(entry.headers).length > 0 && (
                <div className="ds-fetch-entry__headers">
                  {Object.entries(entry.headers).map(([k, v]) => (
                    <div key={k}>
                      <strong>{k}:</strong> {v}
                    </div>
                  ))}
                </div>
              )}
            {expanded && entry.error && (
              <div className="ds-fetch-entry__error">{entry.error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SaveAsSectionForm({
  sectionName,
  sectionDesc,
  onSectionNameChange,
  onSectionDescChange,
  previewType,
  onClose,
  onSubmit,
  saving,
  isNew: _isNew,
}: {
  sectionName: string;
  sectionDesc: string;
  onSectionNameChange: (v: string) => void;
  onSectionDescChange: (v: string) => void;
  previewType: DataSourcePreviewType;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  return (
    <div className="ds-save-section">
      <div className="ds-save-section__header">
        <span>Save as Custom Section</span>
        <button
          className="icon-btn icon-btn--xs"
          onClick={onClose}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
      <div className="ds-save-section__body">
        <div className="ds-save-section__field">
          <label>Name</label>
          <input
            type="text"
            value={sectionName}
            onChange={(e) => onSectionNameChange(e.target.value)}
            placeholder="e.g. Recent Threads Grid"
          />
        </div>
        <div className="ds-save-section__field">
          <label>Description</label>
          <input
            type="text"
            value={sectionDesc}
            onChange={(e) => onSectionDescChange(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="ds-save-section__info">
          Type: <strong>{DATASOURCE_PREVIEW_TYPE_LABELS[previewType]}</strong>
        </div>
        <div className="ds-save-section__actions">
          <button className="ds-save-section__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ds-save-section__submit"
            onClick={onSubmit}
            disabled={saving || !sectionName.trim()}
          >
            {saving ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <Save size={13} />
            )}
            {saving ? "Saving…" : "Save Section"}
          </button>
        </div>
      </div>
    </div>
  );
}

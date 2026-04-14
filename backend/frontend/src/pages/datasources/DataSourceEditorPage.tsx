import { useCallback, useEffect, useState, lazy, Suspense } from "react";
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
} from "lucide-react";
import { apiRequest } from "../../utils/api";
import type { DataSource } from "../../components/landing/types";
import { toast } from "sonner";
import "./DataSources.css";

const MonacoEditor = lazy(() => import("../../components/monaco/Editor"));

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

const DEFAULT_CODE = `// Return an array of items:
// { heading, subheading, icon?, image_url?, link_url? }

return [
  { heading: "Example", subheading: "Hello world" },
];
`;

export default function DataSourceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Compile/evaluate state
  const [compiling, setCompiling] = useState(false);
  const [compiledJS, setCompiledJS] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<CompileResult["diagnostics"]>(
    [],
  );
  const [previewItems, setPreviewItems] = useState<EvalItem[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Active panel on the right
  type RightPanel = "preview" | "compiled" | "diagnostics";
  const [activePanel, setActivePanel] = useState<RightPanel>("preview");

  const fetchDS = useCallback(async () => {
    if (isNew) return;
    try {
      const ds = await apiRequest<DataSource>(`/config/datasources/${id}`);
      setName(ds.name);
      setDescription(ds.description);
      setCode(ds.code);
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
      const payload = { name, description, code };
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
    setDiagnostics([]);

    try {
      const result = await apiRequest<CompileResult>(
        "/config/datasources/compile",
        { method: "POST", body: JSON.stringify({ code }) },
      );
      setCompiledJS(result.js);
      setDiagnostics(result.diagnostics ?? []);

      const errors = (result.diagnostics ?? []).filter((d) => d.category === 1);
      if (errors.length > 0) {
        setEvalError(
          errors.map((d) => `Line ${d.line}: ${d.message}`).join("\n"),
        );
        setActivePanel("diagnostics");
        return;
      }

      // Evaluate compiled JS
      const fn = new Function(
        "fetch",
        `"use strict"; return (async () => { ${result.js} })();`,
      );
      const items = await fn(fetch.bind(globalThis));
      if (!Array.isArray(items)) {
        setEvalError("Code must return an array");
        setActivePanel("diagnostics");
        return;
      }
      setPreviewItems(items as EvalItem[]);
      setActivePanel("preview");
      toast.success(`${items.length} item(s) returned`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEvalError(msg);
      setActivePanel("diagnostics");
    } finally {
      setCompiling(false);
    }
  };

  const codeLineCount = code.split("\n").length;
  const editorHeight = Math.max(400, Math.min(codeLineCount * 20 + 40, 700));

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
    <div className="ds-editor-page">
      {/* Top bar */}
      <div className="ds-editor__topbar">
        <button
          onClick={() => navigate("/datasources")}
          className="ds-editor__back-btn"
        >
          <ArrowLeft size={16} /> Data Sources
        </button>
        <div className="ds-editor__topbar-actions">
          <button
            className="ds-editor__run-btn"
            onClick={handleRun}
            disabled={compiling || !code.trim()}
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
            <Suspense
              fallback={
                <div className="ds-skeleton" style={{ height: editorHeight }} />
              }
            >
              <MonacoEditor
                height={editorHeight}
                language="typescript"
                code={code}
                onChange={(v: string) => setCode(v)}
                editable
              />
            </Suspense>
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
              {diagnostics.length > 0 && (
                <span className="ds-editor__tab-badge ds-editor__tab-badge--warn">
                  {diagnostics.length}
                </span>
              )}
            </button>
          </div>

          <div className="ds-editor__panel-content">
            {/* Preview */}
            {activePanel === "preview" && (
              <div className="ds-editor__preview">
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
                  <div className="ds-editor__preview-grid">
                    {previewItems.map((item, i) => (
                      <div key={i} className="ds-preview-card">
                        {item.image_url && (
                          <div className="ds-preview-card__image">
                            <img
                              src={item.image_url}
                              alt={item.heading ?? ""}
                            />
                          </div>
                        )}
                        <div className="ds-preview-card__body">
                          {item.icon && (
                            <span className="ds-preview-card__icon">
                              {item.icon}
                            </span>
                          )}
                          {item.heading && (
                            <h4 className="ds-preview-card__heading">
                              {item.heading}
                            </h4>
                          )}
                          {item.subheading && (
                            <p className="ds-preview-card__subheading">
                              {item.subheading}
                            </p>
                          )}
                          {item.link_url && (
                            <span className="ds-preview-card__link">
                              {item.link_url}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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
                {diagnostics.length === 0 && !evalError && (
                  <div className="ds-editor__preview-empty">
                    <CheckCircle2 size={32} />
                    <p>No issues. Run the data source to check for errors.</p>
                  </div>
                )}
                {evalError && (
                  <div className="ds-editor__error">
                    <AlertTriangle size={16} />
                    <pre>{evalError}</pre>
                  </div>
                )}
                {diagnostics.map((d, i) => (
                  <div
                    key={i}
                    className={`ds-diagnostic ${d.category === 1 ? "ds-diagnostic--error" : "ds-diagnostic--warn"}`}
                  >
                    <span className="ds-diagnostic__location">
                      Ln {d.line}, Col {d.col}
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

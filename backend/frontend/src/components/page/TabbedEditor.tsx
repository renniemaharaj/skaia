import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  Plus,
  X,
  Lock,
  Unlock,
  Save,
  Trash2,
  AlertTriangle,
  FileCode,
} from "lucide-react";
import { useThemeContext } from "../../hooks/theme/useThemeContext";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";
import "./TabbedEditor.css";

const Editor = lazy(() => import("@monaco-editor/react"));

/* ── Diagnostic type returned by the backend compile endpoint ────────── */
interface CompileDiagnostic {
  file: string;
  line: number;
  col: number;
  message: string;
  category: number; // 0=Warning, 1=Error
}

/* ── Props ───────────────────────────────────────────────────────────── */
export interface TabbedEditorProps {
  /** Map of filename => content (.ts files only). */
  files: Record<string, string>;
  onFilesChange: (files: Record<string, string>) => void;
  /** .env content (separate from files for auth-gating). */
  envData: string;
  onEnvDataChange: (v: string) => void;
  /** 0 for new (unsaved) datasources. */
  datasourceId: number;
  /** Editor area height in px. */
  height?: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
const RESERVED = new Set([".env"]);
const isEnv = (f: string) => f === ".env";
const langFor = (f: string) => (isEnv(f) ? "ini" : "typescript");

function nextFileName(existing: string[]): string {
  const tsFiles = existing.filter((f) => f.endsWith(".ts") && f !== "main.ts");
  for (let i = 1; ; i++) {
    const name = `file${i}.ts`;
    if (!tsFiles.includes(name) && !existing.includes(name)) return name;
  }
}

/**
 * Count diagnostics per file for badge rendering.
 */
function countByFile(
  diags: CompileDiagnostic[],
): Record<string, { errors: number; warnings: number }> {
  const m: Record<string, { errors: number; warnings: number }> = {};
  for (const d of diags) {
    if (!m[d.file]) m[d.file] = { errors: 0, warnings: 0 };
    if (d.category === 1) m[d.file].errors++;
    else m[d.file].warnings++;
  }
  return m;
}

/* ── Component ───────────────────────────────────────────────────────── */
export default function TabbedEditor({
  files,
  onFilesChange,
  envData,
  onEnvDataChange,
  datasourceId,
  height = 400,
}: TabbedEditorProps) {
  const { theme } = useThemeContext();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const modelsRef = useRef<Map<string, MonacoEditor.ITextModel>>(new Map());
  const viewStatesRef = useRef<
    Map<string, MonacoEditor.ICodeEditorViewState | null>
  >(new Map());
  const suppressChangeRef = useRef(false);
  const disposeRef = useRef<IDisposable | null>(null);

  /* All tab names: .env first, then .ts files sorted (main.ts last). */
  const allTabs = useMemo(() => {
    const tsFiles = Object.keys(files).sort((a, b) => {
      if (a === "main.ts") return 1;
      if (b === "main.ts") return -1;
      return a.localeCompare(b);
    });
    return [".env", ...tsFiles];
  }, [files]);

  const [activeTab, setActiveTab] = useState("main.ts");
  const [envLocked, setEnvLocked] = useState(true);
  const [envSaving, setEnvSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CompileDiagnostic[]>([]);
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const diagCounts = useMemo(() => countByFile(diagnostics), [diagnostics]);

  // Compile debounce timer
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Ensure activeTab exists ─────────────────────────────────────── */
  useEffect(() => {
    if (!allTabs.includes(activeTab)) {
      setActiveTab(allTabs.includes("main.ts") ? "main.ts" : allTabs[0]);
    }
  }, [allTabs, activeTab]);

  /* ── Get content for active tab ──────────────────────────────────── */
  const getContent = useCallback(
    (tab: string) => (isEnv(tab) ? envData : (files[tab] ?? "")),
    [files, envData],
  );

  /* ── Monaco model management ─────────────────────────────────────── */
  const getOrCreateModel = useCallback(
    (monaco: typeof import("monaco-editor"), name: string, content: string) => {
      let model = modelsRef.current.get(name);
      if (model && !model.isDisposed()) {
        return model;
      }
      const uri = monaco.Uri.parse(`file:///${name}`);
      model =
        monaco.editor.getModel(uri) ??
        monaco.editor.createModel(content, langFor(name), uri);
      modelsRef.current.set(name, model);
      return model;
    },
    [],
  );

  /* ── Switch editor to a tab ──────────────────────────────────────── */
  const switchToTab = useCallback(
    (tab: string) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      // Save current view state
      const currentModel = editor.getModel();
      if (currentModel) {
        const currentName = [...modelsRef.current.entries()].find(
          ([, m]) => m === currentModel,
        )?.[0];
        if (currentName) {
          viewStatesRef.current.set(currentName, editor.saveViewState());
        }
      }

      // Switch model
      const content = isEnv(tab) ? envData : (files[tab] ?? "");
      const model = getOrCreateModel(monaco, tab, content);

      // Sync content if externally changed
      suppressChangeRef.current = true;
      if (model.getValue() !== content) {
        model.setValue(content);
      }
      suppressChangeRef.current = false;

      editor.setModel(model);

      // Restore view state
      const savedState = viewStatesRef.current.get(tab);
      if (savedState) editor.restoreViewState(savedState);

      editor.focus();

      // Apply markers for this file
      applyMarkers(monaco, tab);
    },
    [files, envData, getOrCreateModel],
  );

  /* ── Apply diagnostic markers to a file's model ──────────────────── */
  const applyMarkers = useCallback(
    (monaco: typeof import("monaco-editor"), tab: string) => {
      const model = modelsRef.current.get(tab);
      if (!model || model.isDisposed()) return;

      const fileDiags = diagnostics.filter((d) => d.file === tab);
      const markers = fileDiags.map((d) => ({
        severity:
          d.category === 1
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.col + 1,
        endLineNumber: d.line,
        endColumn: d.col + 100,
      }));
      monaco.editor.setModelMarkers(model, "tscompile", markers);
    },
    [diagnostics],
  );

  /* ── Re-apply markers when diagnostics change ────────────────────── */
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    for (const tab of allTabs) {
      applyMarkers(monaco, tab);
    }
  }, [diagnostics, allTabs, applyMarkers]);

  /* ── Tab switch ──────────────────────────────────────────────────── */
  useEffect(() => {
    switchToTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ── Live compile ────────────────────────────────────────────────── */
  const triggerCompile = useCallback((updatedFiles: Record<string, string>) => {
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    compileTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest<{
          diagnostics: CompileDiagnostic[];
        }>("/config/datasources/compile", {
          method: "POST",
          body: JSON.stringify({ files: updatedFiles }),
        });
        setDiagnostics(res.diagnostics ?? []);
      } catch {
        // ignore compile errors (network, auth, etc.)
      }
    }, 1000);
  }, []);

  /* Cleanup compile timer */
  useEffect(() => {
    return () => {
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    };
  }, []);

  /* ── Editor mount ────────────────────────────────────────────────── */
  const handleEditorMount = useCallback(
    (
      editor: MonacoEditor.IStandaloneCodeEditor,
      monaco: typeof import("monaco-editor"),
    ) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Create models for all files
      for (const tab of allTabs) {
        getOrCreateModel(monaco, tab, getContent(tab));
      }

      // Switch to active tab
      switchToTab(activeTab);

      // Listen for content changes
      disposeRef.current = editor.onDidChangeModelContent(() => {
        if (suppressChangeRef.current) return;
        const model = editor.getModel();
        if (!model) return;
        const name = [...modelsRef.current.entries()].find(
          ([, m]) => m === model,
        )?.[0];
        if (!name) return;
        const val = model.getValue();
        if (isEnv(name)) {
          onEnvDataChange(val);
        } else {
          const next = { ...files, [name]: val };
          onFilesChange(next);
          triggerCompile(next);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      disposeRef.current?.dispose();
      // Don't dispose models — Monaco manages them globally
    };
  }, []);

  /* ── Sync external changes into models ───────────────────────────── */
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    for (const tab of allTabs) {
      const content = getContent(tab);
      const model = modelsRef.current.get(tab);
      if (model && !model.isDisposed() && model.getValue() !== content) {
        suppressChangeRef.current = true;
        model.setValue(content);
        suppressChangeRef.current = false;
      }
    }
  }, [files, envData, allTabs, getContent]);

  /* ── File actions ────────────────────────────────────────────────── */
  const addFile = () => {
    const name = nextFileName(Object.keys(files));
    onFilesChange({ ...files, [name]: "" });
    setActiveTab(name);
  };

  const removeFile = (name: string) => {
    if (name === "main.ts" || isEnv(name)) return;
    const next = { ...files };
    delete next[name];
    onFilesChange(next);

    // Dispose model
    const model = modelsRef.current.get(name);
    if (model && !model.isDisposed()) model.dispose();
    modelsRef.current.delete(name);

    if (activeTab === name) setActiveTab("main.ts");
    triggerCompile(next);
  };

  const startRename = (name: string) => {
    if (name === "main.ts" || isEnv(name)) return;
    setRenamingTab(name);
    setRenameValue(name);
  };

  const commitRename = () => {
    if (!renamingTab) return;
    let newName = renameValue.trim();
    if (!newName) {
      setRenamingTab(null);
      return;
    }
    if (!newName.endsWith(".ts")) newName += ".ts";
    if (newName === renamingTab || files[newName] || RESERVED.has(newName)) {
      setRenamingTab(null);
      return;
    }
    const next = { ...files };
    next[newName] = next[renamingTab] ?? "";
    delete next[renamingTab];
    onFilesChange(next);

    // Update model
    const monaco = monacoRef.current;
    if (monaco) {
      const oldModel = modelsRef.current.get(renamingTab);
      if (oldModel && !oldModel.isDisposed()) oldModel.dispose();
      modelsRef.current.delete(renamingTab);
      getOrCreateModel(monaco, newName, next[newName]);
    }

    if (activeTab === renamingTab) setActiveTab(newName);
    setRenamingTab(null);
    triggerCompile(next);
  };

  /* ── Env actions ─────────────────────────────────────────────────── */
  const handleEnvSave = async () => {
    if (datasourceId <= 0) return;
    setEnvSaving(true);
    try {
      await apiRequest(`/config/datasources/${datasourceId}/env`, {
        method: "PUT",
        body: JSON.stringify({ env_data: envData }),
      });
      toast.success("Environment variables saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save env vars",
      );
    } finally {
      setEnvSaving(false);
    }
  };

  const handleEnvClear = async () => {
    if (!window.confirm("Remove all environment variables?")) return;
    if (datasourceId > 0) {
      setEnvSaving(true);
      try {
        await apiRequest(`/config/datasources/${datasourceId}/env`, {
          method: "DELETE",
        });
        toast.success("Environment variables cleared.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to clear env vars",
        );
        return;
      } finally {
        setEnvSaving(false);
      }
    }
    onEnvDataChange("");
  };

  /* ── Total errors/warnings ───────────────────────────────────────── */
  const totalErrors = diagnostics.filter((d) => d.category === 1).length;
  const totalWarnings = diagnostics.filter((d) => d.category !== 1).length;

  /* ── Env tab read-only state ─────────────────────────────────────── */
  const isReadOnly = activeTab === ".env" && envLocked;

  return (
    <div className="tabbed-editor">
      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div className="tabbed-editor__tabs">
        <div className="tabbed-editor__tab-list">
          {allTabs.map((tab) => {
            const counts = diagCounts[tab];
            const active = tab === activeTab;
            return (
              <div
                key={tab}
                className={`tabbed-editor__tab ${active ? "tabbed-editor__tab--active" : ""}`}
                onClick={() => {
                  setActiveTab(tab);
                  setRenamingTab(null);
                }}
                onDoubleClick={() =>
                  !isEnv(tab) && tab !== "main.ts" && startRename(tab)
                }
              >
                {renamingTab === tab ? (
                  <input
                    className="tabbed-editor__rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingTab(null);
                    }}
                    onBlur={commitRename}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="tabbed-editor__tab-name">
                      {isEnv(tab) ? (
                        <>
                          {envLocked ? (
                            <Lock size={11} />
                          ) : (
                            <Unlock size={11} />
                          )}
                          <span>.env</span>
                        </>
                      ) : (
                        <>
                          <FileCode size={11} />
                          <span>{tab}</span>
                        </>
                      )}
                    </span>
                    {counts && (counts.errors > 0 || counts.warnings > 0) && (
                      <span
                        className={`tabbed-editor__badge ${counts.errors > 0 ? "tabbed-editor__badge--error" : "tabbed-editor__badge--warn"}`}
                      >
                        {counts.errors > 0 ? counts.errors : counts.warnings}
                      </span>
                    )}
                    {!isEnv(tab) && tab !== "main.ts" && (
                      <button
                        className="tabbed-editor__tab-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(tab);
                        }}
                        title="Close file"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <button
            className="tabbed-editor__add-btn"
            onClick={addFile}
            title="New file"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* ── Tab-level actions ──────────────────────────────────── */}
        <div className="tabbed-editor__actions">
          {activeTab === ".env" && (
            <>
              <button
                className={`icon-btn icon-btn--sm ${envLocked ? "" : "icon-btn--active"}`}
                onClick={() => setEnvLocked((v) => !v)}
                title={envLocked ? "Unlock to edit" : "Lock editor"}
              >
                {envLocked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              {!envLocked && datasourceId > 0 && (
                <button
                  className="icon-btn icon-btn--sm icon-btn--primary"
                  onClick={handleEnvSave}
                  disabled={envSaving}
                  title="Save env vars"
                >
                  <Save size={13} />
                </button>
              )}
              {!envLocked && envData.trim() && (
                <button
                  className="icon-btn icon-btn--sm icon-btn--danger"
                  onClick={handleEnvClear}
                  disabled={envSaving}
                  title="Clear env vars"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
          {(totalErrors > 0 || totalWarnings > 0) && (
            <span className="tabbed-editor__diag-summary">
              {totalErrors > 0 && (
                <span className="tabbed-editor__diag-errors">
                  <AlertTriangle size={12} /> {totalErrors}
                </span>
              )}
              {totalWarnings > 0 && (
                <span className="tabbed-editor__diag-warnings">
                  {totalWarnings} warn
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Env locked placeholder ─────────────────────────────────── */}
      {activeTab === ".env" && envLocked && (
        <div className="tabbed-editor__env-locked" style={{ height }}>
          <Lock size={20} />
          <span>
            {envData.trim()
              ? `${
                  envData
                    .trim()
                    .split("\n")
                    .filter((l) => l.trim() && !l.trim().startsWith("#")).length
                } variable(s) configured`
              : "No variables set"}
          </span>
          <button
            className="tabbed-editor__env-unlock-btn"
            onClick={() => setEnvLocked(false)}
          >
            Unlock to edit
          </button>
        </div>
      )}

      {/* Always keep editor mounted to avoid InstantiationService disposal */}
      <div
        className="tabbed-editor__editor-wrap"
        style={
          activeTab === ".env" && envLocked
            ? { height: 0, overflow: "hidden" }
            : undefined
        }
      >
        <Suspense
          fallback={
            <div className="skeleton-bar" style={{ height, borderRadius: 0 }} />
          }
        >
          <Editor
            height={height}
            theme={theme === "dark" ? "vs-dark" : "vs-light"}
            options={{
              readOnly: isReadOnly,
              padding: { top: 10, bottom: 10 },
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
            }}
            onMount={handleEditorMount}
          />
        </Suspense>
      </div>
    </div>
  );
}

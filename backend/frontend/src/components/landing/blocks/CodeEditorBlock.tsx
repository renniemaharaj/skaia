import { lazy, Suspense, useState, useCallback, useMemo } from "react";
import type { LandingSection } from "../types";
import {
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  setSectionAnimation,
} from "../EditControls";
import { useThemeContext } from "../../../hooks/theme/useThemeContext";
import { Copy, Download, FileCode } from "lucide-react";
import { toast } from "sonner";

/** Lazy-load the project's Monaco wrapper (inherits theme) and ViewThread for md/html. */
const MonacoEditor = lazy(() => import("../../monaco/Editor"));
const ViewThread = lazy(() => import("../../forum/ViewThread"));

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

interface CodeConfig {
  code: string;
  language: string;
  filename: string;
  layout?: string;
}

const DEFAULT_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "csharp",
  "html",
  "css",
  "json",
  "yaml",
  "markdown",
  "sql",
  "shell",
  "dockerfile",
  "xml",
  "php",
  "ruby",
] as const;

/** Languages that can be rendered as rich content in preview. */
const RENDERABLE_LANGUAGES = new Set(["html", "markdown"]);

function parseConfig(config: string): CodeConfig {
  try {
    const parsed = JSON.parse(config || "{}");
    return {
      code: typeof parsed.code === "string" ? parsed.code : "",
      language:
        typeof parsed.language === "string" ? parsed.language : "typescript",
      filename: typeof parsed.filename === "string" ? parsed.filename : "",
      layout: parsed.layout,
    };
  } catch {
    return { code: "", language: "typescript", filename: "" };
  }
}

function updateConfig(config: string, updates: Partial<CodeConfig>): string {
  try {
    const parsed = JSON.parse(config || "{}");
    return JSON.stringify({ ...parsed, ...updates });
  } catch {
    return JSON.stringify(updates);
  }
}

/** Convert markdown to basic HTML for preview. */
function markdownToHtml(md: string): string {
  let html = md
    // headings
    .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
    // bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // hr
    .replace(/^---$/gm, "<hr/>")
    // line breaks: double newline → paragraph
    .replace(/\n\n+/g, "</p><p>")
    // single newline → br
    .replace(/\n/g, "<br/>");
  html = `<p>${html}</p>`;
  return html;
}

function handleCopy(code: string) {
  navigator.clipboard.writeText(code).then(
    () => toast.success("Copied to clipboard"),
    () => toast.error("Failed to copy"),
  );
}

function handleDownload(code: string, filename: string) {
  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "code.txt";
  a.click();
  URL.revokeObjectURL(url);
}

export const CodeEditorBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const cfg = parseConfig(section.config);
  const layout = getSectionLayout(section.config);
  const [editing, setEditing] = useState(false);
  const { theme } = useThemeContext();

  /** When the language is renderable, we show rendered content by default in preview. */
  const isRenderable = RENDERABLE_LANGUAGES.has(cfg.language);
  const [showRendered, setShowRendered] = useState(true);

  const handleCodeChange = useCallback(
    (value: string) => {
      onUpdate({
        ...section,
        config: updateConfig(section.config, { code: value }),
      });
    },
    [section, onUpdate],
  );

  const handleLanguageChange = (lang: string) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { language: lang }),
    });
  };

  const handleFilenameChange = (filename: string) => {
    onUpdate({
      ...section,
      config: updateConfig(section.config, { filename }),
    });
  };

  const lineCount = (cfg.code || "").split("\n").length;
  const editorHeight = Math.max(150, Math.min(lineCount * 20 + 40, 600));

  /** HTML for renderable preview (markdown→html or raw html). */
  const renderedHtml = useMemo(() => {
    if (!isRenderable || !cfg.code) return "";
    if (cfg.language === "markdown") return markdownToHtml(cfg.code);
    return cfg.code; // html
  }, [isRenderable, cfg.code, cfg.language]);

  const showingRenderedPreview =
    isRenderable && showRendered && !editing && !!cfg.code;

  return (
    <section className="code-editor-block">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Code Editor"
          layout={layout}
          onLayoutChange={(nextLayout) =>
            onUpdate({
              ...section,
              config: setSectionLayout(section.config, nextLayout),
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
            <>
              <button
                className="landing-section-toolbar-btn"
                onClick={() => setEditing(!editing)}
                title={editing ? "Preview" : "Edit code"}
              >
                {editing ? "Preview" : "Edit"}
              </button>
              {isRenderable && !editing && cfg.code && (
                <button
                  className="landing-section-toolbar-btn"
                  onClick={() => setShowRendered((v) => !v)}
                  title={showRendered ? "Show source" : "Render content"}
                >
                  {showRendered ? "Source" : "Render"}
                </button>
              )}
            </>
          }
        />
      )}

      {/* Controls bar — visible only when editing */}
      {canEdit && editing && (
        <div className="code-editor-controls">
          <label className="code-editor-control">
            <span>Language</span>
            <select
              value={cfg.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              {DEFAULT_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>

          <label className="code-editor-control">
            <span>Filename</span>
            <input
              type="text"
              value={cfg.filename}
              onChange={(e) => handleFilenameChange(e.target.value)}
              placeholder="e.g. main.ts"
            />
          </label>
        </div>
      )}

      {/* File header — show when not editing (guest or admin preview) */}
      {!editing && cfg.code && (
        <div
          className={`code-editor-file-header ${theme === "dark" ? "" : "code-editor-file-header-light"}`}
        >
          <span className="code-editor-file-dot" />
          <span className="code-editor-file-dot" />
          <span className="code-editor-file-dot" />
          {cfg.filename && (
            <span className="code-editor-filename">
              <FileCode size={13} style={{ marginRight: 4, opacity: 0.7 }} />
              {cfg.filename}
            </span>
          )}
          {cfg.language && (
            <span className="code-editor-lang-badge">{cfg.language}</span>
          )}
          {/* Guest action buttons */}
          <span className="code-editor-actions">
            {isRenderable && !canEdit && cfg.code && (
              <button
                className="code-editor-action-btn"
                onClick={() => setShowRendered((v) => !v)}
                title={showRendered ? "Show source" : "Render content"}
              >
                {showRendered ? "Source" : "Render"}
              </button>
            )}
            <button
              className="code-editor-action-btn"
              onClick={() => handleCopy(cfg.code)}
              title="Copy code"
            >
              <Copy size={14} />
            </button>
            <button
              className="code-editor-action-btn"
              onClick={() => handleDownload(cfg.code, cfg.filename)}
              title="Download file"
            >
              <Download size={14} />
            </button>
          </span>
        </div>
      )}

      <Suspense
        fallback={
          <div
            className="skeleton-bar"
            style={{ height: editorHeight, borderRadius: 12 }}
          />
        }
      >
        {canEdit && editing ? (
          <MonacoEditor
            height={editorHeight}
            language={cfg.language}
            code={cfg.code}
            onChange={handleCodeChange}
            editable
          />
        ) : showingRenderedPreview ? (
          <div className="code-editor-rendered">
            <ViewThread content={renderedHtml} />
          </div>
        ) : cfg.code ? (
          <MonacoEditor
            height={editorHeight}
            language={cfg.language}
            code={cfg.code}
            editable={false}
          />
        ) : canEdit ? (
          <div className="code-editor-empty" onClick={() => setEditing(true)}>
            <p>Click "Edit" to add code content…</p>
          </div>
        ) : null}
      </Suspense>
    </section>
  );
};

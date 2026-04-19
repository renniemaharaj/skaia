import { lazy, Suspense, useCallback, useState } from "react";
import { Lock, Unlock, Save, Trash2 } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import "./EnvVarsEditor.css";

const MonacoEditor = lazy(() => import("../monaco/Editor"));

interface Props {
  /** 0 for new (unsaved) datasources. */
  datasourceId: number;
  /** Current .env text — parent owns the state. */
  value: string;
  /** Called whenever the text changes. */
  onChange: (v: string) => void;
}

export default function EnvVarsEditor({
  datasourceId,
  value,
  onChange,
}: Props) {
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);
  const isPersisted = datasourceId > 0;

  const handleSave = useCallback(async () => {
    if (!isPersisted) return;
    setSaving(true);
    try {
      await apiRequest(`/config/datasources/${datasourceId}/env`, {
        method: "PUT",
        body: JSON.stringify({ env_data: value }),
      });
      toast.success("Environment variables saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save env vars",
      );
    } finally {
      setSaving(false);
    }
  }, [datasourceId, value, isPersisted]);

  const handleClear = useCallback(async () => {
    if (
      !window.confirm("Remove all environment variables for this datasource?")
    )
      return;
    if (isPersisted) {
      setSaving(true);
      try {
        await apiRequest(`/config/datasources/${datasourceId}/env`, {
          method: "DELETE",
        });
        toast.success("Environment variables cleared.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to clear env vars",
        );
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    onChange("");
  }, [datasourceId, isPersisted, onChange]);

  const lineCount = (value || "").split("\n").length;
  const editorHeight = Math.max(120, Math.min(lineCount * 20 + 40, 300));

  return (
    <div className="env-vars-editor">
      <div className="env-vars-header">
        <div className="env-vars-title">
          <span className="env-vars-label">Environment Variables</span>
          <span className="env-vars-hint">
            .env format — injected at runtime
          </span>
        </div>
        <div className="env-vars-actions">
          <button
            type="button"
            className={`icon-btn icon-btn--sm ${locked ? "" : "icon-btn--active"}`}
            onClick={() => setLocked((v) => !v)}
            title={locked ? "Unlock to edit" : "Lock editor"}
          >
            {locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          {!locked && (
            <>
              {isPersisted && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm icon-btn--primary"
                  onClick={handleSave}
                  disabled={saving}
                  title="Save environment variables"
                >
                  <Save size={14} />
                </button>
              )}
              {value.trim() && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm icon-btn--danger"
                  onClick={handleClear}
                  disabled={saving}
                  title="Clear all environment variables"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="env-vars-body">
        {locked ? (
          <div className="env-vars-locked">
            <Lock size={16} />
            <span>
              {value.trim()
                ? `${
                    value
                      .trim()
                      .split("\n")
                      .filter((l) => l.trim() && !l.trim().startsWith("#"))
                      .length
                  } variable(s) configured`
                : "No variables set"}
            </span>
          </div>
        ) : (
          <Suspense
            fallback={
              <div
                className="skeleton-bar"
                style={{ height: editorHeight, borderRadius: 8 }}
              />
            }
          >
            <MonacoEditor
              height={editorHeight}
              language="ini"
              code={value}
              onChange={(v: string) => onChange(v)}
              editable
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

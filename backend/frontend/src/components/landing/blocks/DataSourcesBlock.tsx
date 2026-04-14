import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import type { LandingSection, DataSource } from "../types";
import { usePageBuilderContext } from "../PageBuilderContext";
import { ImageCardGrid } from "./ImageCardGrid";
import "./DataSourcesBlock.css";
import {
  SectionToolbar,
  getSectionLayout,
  setSectionLayout,
  getSectionMargins,
  setSectionMargins,
  getSectionAnimation,
  setSectionAnimation,
} from "../EditControls";
import { apiRequest } from "../../../utils/api";
import { Plus, Pencil, Trash2, Database, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MonacoEditor = lazy(() => import("../../monaco/Editor"));

interface Props {
  section: LandingSection;
  canEdit: boolean;
  onUpdate: (s: LandingSection) => void;
  onDelete: (id: number) => void;
}

export const DataSourcesBlock = ({
  section,
  canEdit,
  onUpdate,
  onDelete,
}: Props) => {
  const layout = getSectionLayout(section.config);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const isAuthError = (message: string) =>
    /unauthorized|authentication|login required|401/i.test(message);

  // Editing state
  const [editingDS, setEditingDS] = useState<DataSource | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);

  const { enterEdit, leaveEdit } = usePageBuilderContext();
  useEffect(() => {
    if (!editingDS) return;
    enterEdit();
    return () => leaveEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingDS]);

  const fetchDataSources = useCallback(async () => {
    setAuthError(false);
    try {
      const list = await apiRequest<DataSource[]>("/config/datasources");
      setDataSources(list ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isAuthError(msg)) {
        setAuthError(true);
      }
      console.error("Failed to load data sources", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDataSources();
  }, [fetchDataSources]);

  const startNew = () => {
    setEditingDS({
      id: 0,
      name: "",
      description: "",
      code: "",
      created_at: "",
      updated_at: "",
    });
    setFormName("");
    setFormDesc("");
    setFormCode(
      '// Return an array of items:\n// { heading, subheading, icon?, image_url?, link_url? }\n\nreturn [\n  { heading: "Example", subheading: "Hello world" },\n];\n',
    );
  };

  const startEdit = (ds: DataSource) => {
    setEditingDS(ds);
    setFormName(ds.name);
    setFormDesc(ds.description);
    setFormCode(ds.code);
  };

  const cancelEdit = () => setEditingDS(null);

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: formName, description: formDesc, code: formCode };
      if (editingDS && editingDS.id > 0) {
        await apiRequest<DataSource>(`/config/datasources/${editingDS.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("Data source updated");
      } else {
        await apiRequest<DataSource>("/config/datasources", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Data source created");
      }
      setEditingDS(null);
      fetchDataSources();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isAuthError(msg)) {
        setAuthError(true);
      }
      toast.error("Failed to save data source");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this data source?")) return;
    try {
      await apiRequest(`/config/datasources/${id}`, { method: "DELETE" });
      toast.success("Data source deleted");
      fetchDataSources();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isAuthError(msg)) {
        setAuthError(true);
      }
      toast.error("Failed to delete data source");
      console.error(err);
    }
  };

  const codeLineCount = (formCode || "").split("\n").length;
  const editorHeight = Math.max(200, Math.min(codeLineCount * 20 + 40, 500));

  return (
    <section className="data-sources-block">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label="Data Sources"
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
        />
      )}

      <div className="data-sources-header">
        <h2>
          <Database
            size={20}
            style={{ marginRight: 8, verticalAlign: "middle" }}
          />
          {section.heading || "Data Sources"}
        </h2>
        {canEdit && !editingDS && (
          <button className="data-sources-add-btn" onClick={startNew}>
            <Plus size={16} /> New Data Source
          </button>
        )}
      </div>

      {/* Inline editor */}
      {editingDS && (
        <div className="data-sources-editor">
          <div className="data-sources-editor-fields">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Recent forum threads"
              />
            </label>
            <label>
              <span>Description</span>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="What this data source produces"
              />
            </label>
          </div>
          <div className="data-sources-editor-code">
            <span className="data-sources-editor-code-label">
              Code (TypeScript — must return an array)
            </span>
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
                language="typescript"
                code={formCode}
                onChange={(v: string) => setFormCode(v)}
                editable
              />
            </Suspense>
          </div>
          <div className="data-sources-editor-actions">
            <button
              className="data-sources-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : editingDS.id > 0 ? "Update" : "Create"}
            </button>
            <button className="data-sources-cancel-btn" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="data-sources-frame">
        {/* Data sources table */}
        {loading ? (
          <div
            className="skeleton-bar"
            style={{ height: 100, borderRadius: 8 }}
          />
        ) : dataSources.length === 0 ? (
          <p className="data-sources-empty">
            No data sources yet. Create one to get started.
          </p>
        ) : (
          <>
            <table className="data-sources-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Updated</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {dataSources.map((ds) => (
                  <tr key={ds.id}>
                    <td className="data-sources-id">{ds.id}</td>
                    <td className="data-sources-name">{ds.name}</td>
                    <td className="data-sources-desc">
                      {ds.description || "—"}
                    </td>
                    <td className="data-sources-date">
                      {new Date(ds.updated_at).toLocaleDateString()}
                    </td>
                    {canEdit && (
                      <td className="data-sources-actions">
                        <button
                          className="data-sources-action-btn"
                          onClick={() => startEdit(ds)}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="data-sources-action-btn data-sources-action-danger"
                          onClick={() => handleDelete(ds.id)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="data-sources-card-preview">
              <ImageCardGrid
                items={dataSources.map((ds) => ({
                  heading: ds.name,
                  subheading: ds.description,
                  icon: <Database size={18} />,
                  width: "regular",
                }))}
              />
            </div>
          </>
        )}
        {authError && !loading && (
          <div className="data-sources-protected">
            <div className="data-sources-protected__content">
              <AlertTriangle size={24} />
              <div>
                <strong>Protected content</strong>
                <p>This data sources section requires a login to view.</p>
                <Link to="/login" className="data-sources-protected__link">
                  Sign in to continue
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

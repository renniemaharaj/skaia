import { useState } from "react";
import { X, Check, Loader } from "lucide-react";
import { apiRequest } from "../../utils/api";
import "../forum/ThreadActions.css";

interface CreateStoreCategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateStoreCategoryDialog: React.FC<
  CreateStoreCategoryDialogProps
> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    display_order: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!formData.name.trim()) throw new Error("Category name is required");
      await apiRequest("/store/categories", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      setFormData({ name: "", description: "", display_order: 0 });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create category",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          backgroundColor: "var(--bg-secondary)",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "480px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.3rem" }}>
              New Store Category
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
              }}
            >
              Add a category to organise your products
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              form="create-store-category-form"
              disabled={loading || !formData.name.trim()}
              style={{
                background: "var(--primary-color)",
                border: "none",
                borderRadius: "6px",
                padding: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                color: "white",
              }}
            >
              {loading ? (
                <Loader size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-tertiary)",
                border: "none",
                borderRadius: "6px",
                padding: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <form
          id="create-store-category-form"
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--error-bg, #fee2e2)",
                borderRadius: "6px",
                color: "var(--error-text, #dc2626)",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Ranks"
              value={formData.name}
              onChange={(e) =>
                setFormData((p) => ({ ...p, name: e.target.value }))
              }
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              type="text"
              placeholder="Optional short description"
              value={formData.description}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label">Display Order</label>
            <input
              className="form-input"
              type="number"
              min={0}
              value={formData.display_order}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  display_order: Number(e.target.value),
                }))
              }
            />
          </div>
        </form>
      </div>
    </div>
  );
};

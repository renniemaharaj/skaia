import { Check, Loader, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import "../forum/NewThread.css";
import "../forum/IconButton.css";

export const NewStoreCategory = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    display_order: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!formData.name.trim()) throw new Error("Category name is required");
      await apiRequest("/store/categories", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      navigate("/store");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>New Store Category</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Add a category to organise your products
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className="action-btn btn-close"
            onClick={() => navigate("/store")}
            title="Cancel"
          >
            <X size={20} />
          </button>
          <button
            type="button"
            className="action-btn btn-submit"
            onClick={handleSubmit}
            disabled={loading || !formData.name.trim()}
            title="Create"
          >
            {loading ? <Loader size={20} className="spin" /> : <Check size={20} />}
          </button>
        </div>
      </div>

      <div className="modal-form">
        {error && (
          <div
            style={{
              padding: "12px",
              background: "var(--error-bg, #fee2e2)",
              borderRadius: "4px",
              color: "var(--error-text, #dc2626)",
              fontSize: "14px",
              marginBottom: "16px",
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
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <input
            className="form-input"
            type="text"
            placeholder="Optional short description"
            value={formData.description}
            onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Display Order</label>
          <input
            className="form-input"
            type="number"
            min={0}
            value={formData.display_order}
            onChange={e =>
              setFormData(p => ({
                ...p,
                display_order: Number(e.target.value),
              }))
            }
          />
        </div>
      </div>
    </div>
  );
};

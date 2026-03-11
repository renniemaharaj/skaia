import { useState } from "react";
import { X, Check, Loader } from "lucide-react";
import { apiRequest } from "../../utils/api";
import type { StoreCategory } from "../../atoms/store";
import "../forum/ThreadActions.css";

interface CreateProductDialogProps {
  isOpen: boolean;
  categories: StoreCategory[];
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateProductDialog: React.FC<CreateProductDialogProps> = ({
  isOpen,
  categories,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    category_id: categories[0]?.id ?? "",
    name: "",
    description: "",
    price: "",
    stock: "0",
    stock_unlimited: false,
    image_url: "",
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!formData.name.trim()) throw new Error("Product name is required");
      if (!formData.category_id) throw new Error("Category is required");
      const price = parseFloat(formData.price);
      if (isNaN(price) || price < 0) throw new Error("Valid price is required");

      await apiRequest("/store/products", {
        method: "POST",
        body: JSON.stringify({
          category_id: Number(formData.category_id),
          name: formData.name,
          description: formData.description,
          price,
          stock: Number(formData.stock),
          stock_unlimited: formData.stock_unlimited,
          image_url: formData.image_url,
          is_active: formData.is_active,
        }),
      });

      setFormData({
        category_id: categories[0]?.id ?? "",
        name: "",
        description: "",
        price: "",
        stock: "0",
        stock_unlimited: false,
        image_url: "",
        is_active: true,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
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
          maxWidth: "520px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
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
            <h2 style={{ margin: 0, fontSize: "1.3rem" }}>New Product</h2>
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
              }}
            >
              Add a product to your store
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              form="create-product-form"
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
          id="create-product-form"
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
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
            <label className="form-label">Category *</label>
            <select
              className="form-input"
              value={formData.category_id}
              onChange={(e) =>
                setFormData((p) => ({ ...p, category_id: e.target.value }))
              }
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Diamond Rank"
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
            <textarea
              className="form-input"
              rows={3}
              placeholder="What does this product include?"
              value={formData.description}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px",
            }}
          >
            <div className="form-group">
              <label className="form-label">Price (USD) *</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="9.99"
                value={formData.price}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, price: e.target.value }))
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Stock</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={formData.stock}
                disabled={formData.stock_unlimited}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, stock: e.target.value }))
                }
              />
            </div>
          </div>

          <div
            className="form-group"
            style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}
          >
            <input
              type="checkbox"
              id="stock_unlimited"
              checked={formData.stock_unlimited}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  stock_unlimited: e.target.checked,
                }))
              }
            />
            <label
              htmlFor="stock_unlimited"
              className="form-label"
              style={{ marginBottom: 0 }}
            >
              Unlimited stock (always shows as in stock)
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Image URL</label>
            <input
              className="form-input"
              type="text"
              placeholder="https://example.com/image.png"
              value={formData.image_url}
              onChange={(e) =>
                setFormData((p) => ({ ...p, image_url: e.target.value }))
              }
            />
          </div>

          <div
            className="form-group"
            style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}
          >
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData((p) => ({ ...p, is_active: e.target.checked }))
              }
            />
            <label
              htmlFor="is_active"
              className="form-label"
              style={{ marginBottom: 0 }}
            >
              Active (visible to players)
            </label>
          </div>
        </form>
      </div>
    </div>
  );
};

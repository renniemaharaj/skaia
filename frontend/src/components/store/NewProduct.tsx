import { useAtom } from "jotai";
import { Check, Loader, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type ProductMedia, productCategoriesAtom } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import Select from "../input/Select";
import { ProductMediaTable } from "./ProductMediaTable";
import "../forum/NewThread.css";
import "../forum/IconButton.css";

export const NewProduct = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useAtom(productCategoriesAtom);

  const [formData, setFormData] = useState({
    category_id: categories[0]?.id ?? "",
    name: "",
    description: "",
    price: "",
    stock: "0",
    stock_unlimited: false,
    image_url: "",
    media: [] as ProductMedia[],
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [specialActions, setSpecialActions] = useState<{ type: string; value: string }[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);

  useEffect(() => {
    // Fetch fresh categories from API
    apiRequest("/store/categories")
      .then(res => {
        const fetchedCats = Array.isArray(res) ? res : [];
        setCategories(fetchedCats);
        if (fetchedCats.length > 0 && !formData.category_id) {
          setFormData(prev => ({ ...prev, category_id: fetchedCats[0].id }));
        } else if (fetchedCats.length === 0) {
          setFormData(prev => ({ ...prev, category_id: "" }));
        }
      })
      .catch(err => console.error("Failed to load categories:", err));

    apiRequest("/users/roles")
      .then(res => setAvailableRoles(Array.isArray(res) ? res : []))
      .catch(err => console.error("Failed to load roles:", err));
  }, []);

  useEffect(() => {
    // If categories load later, set it
    if (!formData.category_id && categories.length > 0) {
      setFormData(prev => ({ ...prev, category_id: categories[0].id }));
    }
  }, [categories, formData.category_id]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!formData.name.trim()) throw new Error("Product name is required");
      if (!formData.category_id) throw new Error("Category is required");
      const catId = Number(formData.category_id);
      if (Number.isNaN(catId) || catId <= 0) throw new Error("Valid category is required");

      const price = Number.parseFloat(formData.price);
      if (Number.isNaN(price) || price < 0) throw new Error("Valid price is required");

      await apiRequest("/store/products", {
        method: "POST",
        body: JSON.stringify({
          category_id: catId,
          name: formData.name,
          description: formData.description,
          price,
          stock: Number(formData.stock),
          stock_unlimited: formData.stock_unlimited,
          image_url: formData.media[0]?.url ?? formData.image_url,
          media: formData.media,
          is_active: formData.is_active,
          special_actions: JSON.stringify(specialActions.filter(a => a.value !== "")),
        }),
      });

      navigate("/store");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <div className="modal-title-wrapper">
          <h2>New Product</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
            Add a product to your store
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

      <div className="modal-form compact-form-card">
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
          <Select
            className="form-input"
            label="Category *"
            value={formData.category_id}
            options={categories.map(c => ({
              value: c.id,
              label: c.name,
            }))}
            onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Name *</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Diamond Rank"
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="What does this product include?"
            value={formData.description}
            onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
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
              onChange={e => setFormData(p => ({ ...p, price: e.target.value }))}
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
              onChange={e => setFormData(p => ({ ...p, stock: e.target.value }))}
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
            onChange={e =>
              setFormData(p => ({
                ...p,
                stock_unlimited: e.target.checked,
              }))
            }
          />
          <label htmlFor="stock_unlimited" className="form-label" style={{ marginBottom: 0 }}>
            Unlimited stock (always shows as in stock)
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Marketing Media</label>
          <ProductMediaTable
            media={formData.media}
            editable
            onChange={media =>
              setFormData(p => ({
                ...p,
                media,
                image_url: media[0]?.url ?? "",
              }))
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
            onChange={e => setFormData(p => ({ ...p, is_active: e.target.checked }))}
          />
          <label htmlFor="is_active" className="form-label" style={{ marginBottom: 0 }}>
            Active (visible to players)
          </label>
        </div>

        <div className="form-group store-special-actions">
          <label className="form-label">Special Actions on Purchase</label>
          <p className="store-special-actions__help">
            Add digital assets or perks to give users when they buy this product.
          </p>
          {specialActions.map((action, idx) => (
            <div key={idx} className="store-special-action-row">
              <Select
                size="sm"
                value={action.type}
                options={[
                  { value: "role", label: "Assign Role" },
                  { value: "credit", label: "Give Store Credit (cents)" },
                ]}
                onChange={e => {
                  const newActions = [...specialActions];
                  newActions[idx].type = e.target.value;
                  newActions[idx].value = "";
                  setSpecialActions(newActions);
                }}
              />

              {action.type === "role" ? (
                <Select
                  size="sm"
                  value={action.value}
                  options={[
                    { value: "", label: "Select Role..." },
                    ...availableRoles.map(r => ({
                      value: r.name,
                      label: r.name,
                    })),
                  ]}
                  onChange={e => {
                    const newActions = [...specialActions];
                    newActions[idx].value = e.target.value;
                    setSpecialActions(newActions);
                  }}
                />
              ) : (
                <input
                  type="number"
                  className="form-input form-input--sm"
                  placeholder="Amount in cents"
                  value={action.value}
                  onChange={e => {
                    const newActions = [...specialActions];
                    newActions[idx].value = e.target.value;
                    setSpecialActions(newActions);
                  }}
                />
              )}
              <button
                type="button"
                className="btn-admin-icon"
                style={{ color: "var(--color-danger)" }}
                onClick={() => setSpecialActions(specialActions.filter((_, i) => i !== idx))}
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-start", marginTop: "0.5rem" }}
            onClick={() => setSpecialActions([...specialActions, { type: "role", value: "" }])}
          >
            + Add Action
          </button>
        </div>
      </div>
    </div>
  );
};

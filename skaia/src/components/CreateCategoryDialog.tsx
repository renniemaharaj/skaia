import { useState } from "react";
import { X, Check, Loader } from "lucide-react";
import { apiRequest } from "../utils/api";
import "./ThreadActions.css";

const animationStyles = `
  @keyframes spinCheck {
    from {
      transform: rotate(0deg) scale(1);
      opacity: 1;
    }
    to {
      transform: rotate(360deg) scale(1);
      opacity: 1;
    }
  }
  
  .submit-btn-animated {
    animation: spinCheck 0.6s linear;
  }
`;

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = animationStyles;
  document.head.appendChild(style);
}

interface CreateCategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ForumCategory {
  id: string;
  name: string;
  description: string;
  threads: [];
  created_at?: string;
  display_order?: number;
}

export const CreateCategoryDialog: React.FC<CreateCategoryDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!formData.name.trim()) {
        throw new Error("Category name is required");
      }

      await apiRequest<ForumCategory>("/forum/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          display_order: 0,
        }),
      });

      setFormData({ name: "", description: "" });
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

  const handleClose = () => {
    setFormData({ name: "", description: "" });
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={handleClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          backgroundColor: "var(--bg-secondary)",
          borderRadius: "8px",
          padding: "20px",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          className="modal-header"
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
          }}
        >
          <div className="modal-title-wrapper">
            <h2 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
              Create Category
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Add a new forum category for discussions
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              form="create-category-form"
              disabled={loading || !formData.name.trim()}
              className={`thread-action-btn ${loading ? "submit-btn-animated" : ""}`}
              title={loading ? "Submitting..." : "Submit"}
              style={{
                background: "none",
                border: "none",
                cursor:
                  loading || !formData.name.trim() ? "not-allowed" : "pointer",
                color:
                  loading || !formData.name.trim()
                    ? "var(--text-disabled, #9ca3af)"
                    : "var(--text-primary)",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {loading ? <Loader size={20} /> : <Check size={20} />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="thread-action-btn btn-close"
              title="Close"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <form
          id="create-category-form"
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          {error && (
            <div
              style={{
                color: "#ef4444",
                padding: "12px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          <div
            className="form-group"
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <label htmlFor="category-name" style={{ fontWeight: "500" }}>
              Category Name *
            </label>
            <input
              id="category-name"
              type="text"
              placeholder="e.g., General Discussion"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              style={{
                padding: "12px",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
              disabled={loading}
            />
          </div>

          <div
            className="form-group"
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <label htmlFor="category-description" style={{ fontWeight: "500" }}>
              Description
            </label>
            <textarea
              id="category-description"
              placeholder="Describe the category (optional)"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              style={{
                padding: "12px",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                fontSize: "14px",
                minHeight: "100px",
                resize: "none",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
              disabled={loading}
            />
          </div>
        </form>
      </div>
    </div>
  );
};

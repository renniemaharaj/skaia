import { ClipboardList, Plus, Trash2, Wallet } from "lucide-react";
import type { StoreCategory } from "../../atoms/store";

interface StoreCategoryBarProps {
  categories: StoreCategory[];
  selectedCategoryId: string | null;
  canCreateCategory: boolean;
  canCreateProduct: boolean;
  canDeleteCategory: boolean;
  isAuthenticated: boolean;
  onSelectCategory: (categoryId: string | null) => void;
  onDeleteCategory: (categoryId: string) => void;
  onNavigate: (path: string) => void;
}

export function StoreCategoryBar({
  categories,
  selectedCategoryId,
  canCreateCategory,
  canCreateProduct,
  canDeleteCategory,
  isAuthenticated,
  onSelectCategory,
  onDeleteCategory,
  onNavigate,
}: StoreCategoryBarProps) {
  return (
    <div className="categories-bar">
      <div className="category-list">
        <button
          type="button"
          className={`category-button ${!selectedCategoryId ? "category-active" : ""}`}
          onClick={() => onSelectCategory(null)}
        >
          All
        </button>
        {categories.map((cat) => (
          <div key={cat.id} className="category-item">
            <button
              type="button"
              className={`category-button ${
                selectedCategoryId === cat.id ? "category-active" : ""
              }`}
              onClick={() => onSelectCategory(cat.id)}
            >
              {cat.name}
            </button>
            {canDeleteCategory && (
              <button
                type="button"
                className="btn-admin-icon btn-danger"
                title="Delete category"
                onClick={() => onDeleteCategory(cat.id)}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {canCreateCategory && (
          <button
            type="button"
            className="btn-admin-action"
            onClick={() => onNavigate("/store/new-category")}
            title="New category"
            aria-label="New category"
          >
            <Plus size={16} />
            <span className="store-action-label">New Category</span>
          </button>
        )}
        {canCreateProduct && categories.length > 0 && (
          <button
            type="button"
            className="btn-admin-action"
            onClick={() => onNavigate("/store/new-product")}
            title="New product"
            aria-label="New product"
          >
            <Plus size={16} />
            <span className="store-action-label">New Product</span>
          </button>
        )}
        {isAuthenticated && (
          <>
            <button
              type="button"
              className="btn-admin-action store-wallet-button"
              onClick={() => onNavigate(`/wallet/${crypto.randomUUID()}`)}
              title="My Wallet"
              aria-label="My Wallet"
            >
              <Wallet size={16} />
              <span className="store-action-label">Wallet</span>
            </button>
            <button
              type="button"
              className="btn-admin-action store-orders-button"
              onClick={() => onNavigate("/store/orders")}
              title="My Orders"
              aria-label="My Orders"
            >
              <ClipboardList size={16} />
              <span className="store-action-label">My Orders</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

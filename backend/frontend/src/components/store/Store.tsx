import { useState, useEffect, useCallback, useRef } from "react";
import { Package, Plus, StoreIcon, Trash2, Wallet } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import "../../pages/store/ProductPage.css";
import {
  currentUserAtom,
  isAuthenticatedAtom,
  socketAtom,
} from "../../atoms/auth";
import {
  productsAtom,
  productCategoriesAtom,
  selectedCategoryIdAtom,
  filteredProductsAtom,
  storeCartItemsAtom,
  type CartItem,
  type Product,
  type StoreCategory,
} from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { SkeletonCard } from "../ui/SkeletonCard";

import { EditProductDialog } from "./EditProductDialog";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import "./Store.css";
import { InlineProduct } from "./InlineProduct";

const PRODUCT_SKELETON_KEYS = [
  "product-skeleton-1",
  "product-skeleton-2",
  "product-skeleton-3",
  "product-skeleton-4",
  "product-skeleton-5",
  "product-skeleton-6",
];

export const Store: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const navigate = useNavigate();

  const currentUser = useAtomValue(currentUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const categories = useAtomValue(productCategoriesAtom);
  const products = useAtomValue(filteredProductsAtom);
  const selectedCategoryId = useAtomValue(selectedCategoryIdAtom);

  const setProducts = useSetAtom(productsAtom);
  const setCategories = useSetAtom(productCategoriesAtom);
  const setSelectedCategory = useSetAtom(selectedCategoryIdAtom);
  const setCartItems = useSetAtom(storeCartItemsAtom);

  const { subscribe } = useWebSocketSync();

  const [guestSandboxMode] = useGuestSandboxMode();

  // Permissions
  const canCreateProduct =
    currentUser?.permissions?.includes("store.product-new") || guestSandboxMode;
  const canEditProduct =
    currentUser?.permissions?.includes("store.product-edit") ||
    guestSandboxMode;
  const canDeleteProduct =
    currentUser?.permissions?.includes("store.product-delete") ||
    guestSandboxMode;
  const canManageCategories =
    currentUser?.permissions?.includes("store.manageCategories") ||
    guestSandboxMode;
  const canCreateCategory = canManageCategories || guestSandboxMode;
  const canDeleteCategory = canManageCategories || guestSandboxMode;

  // Load catalog
  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const [catsRes, prodsRes] = await Promise.all([
        apiRequest<StoreCategory[]>("/store/categories"),
        apiRequest<Product[]>("/store/products"),
      ]);
      setCategories(Array.isArray(catsRes) ? catsRes : []);
      setProducts(Array.isArray(prodsRes) ? prodsRes : []);

      // Subscribe to per-category updates so admin mutations propagate
      if (Array.isArray(catsRes)) {
        for (const category of catsRes) {
          subscribe("store_category", category.id);
        }
      }
    } catch (err) {
      console.error("Error loading store catalog:", err);
    } finally {
      setLoading(false);
    }
  }, [setCategories, setProducts, subscribe]);

  // Load user's backend cart (authenticated)
  const loadCart = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const resp = await apiRequest<{ items: CartItem[] }>("/store/cart");
      if (resp && Array.isArray(resp.items)) {
        setCartItems(resp.items);
      }
    } catch {
      // silent - cart may be empty
    }
  }, [isAuthenticated, setCartItems]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // Re-fetch catalog and cart whenever the WebSocket reconnects.
  // This clears stale localStorage-persisted data after a server restart / DB wipe.
  const socket = useAtomValue(socketAtom);
  const socketMounted = useRef(false);
  useEffect(() => {
    if (!socketMounted.current) {
      socketMounted.current = true;
      return; // skip the initial mount - initial load is handled above
    }
    if (socket) {
      loadCatalog();
      loadCart();
    }
  }, [socket, loadCatalog, loadCart]);

  // Cart actions
  const handleAddToCart = async (product: Product) => {
    if (!isAuthenticated) {
      // Optimistic local-only cart for guests
      setCartItems((prev) => {
        const existing = prev.find((i) => i.product_id === product.id);
        if (existing) {
          return prev.map((i) =>
            i.product_id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          );
        }
        return [
          ...prev,
          {
            id: `local-${product.id}`,
            user_id: "0",
            product_id: product.id,
            quantity: 1,
            added_at: new Date().toISOString(),
            product,
          },
        ];
      });
      return;
    }
    try {
      await apiRequest("/store/cart/add", {
        method: "POST",
        body: JSON.stringify({ product_id: Number(product.id), quantity: 1 }),
      });
      await loadCart();
    } catch (err) {
      console.error("Error adding to cart:", err);
    }
  };

  // Admin actions
  const handleDeleteProduct = async (productId: string) => {
    try {
      await apiRequest(`/store/products/${productId}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      console.error("Error deleting product:", err);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await apiRequest(`/store/categories/${categoryId}`, { method: "DELETE" });
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      setSelectedCategory(null);
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  return (
    <div className="store-container">
      {/* Categories Bar */}
      <div className="categories-bar">
        <div className="category-list">
          <StoreIcon className="category-icon" size={24} />
          <button
            type="button"
            className={`category-button ${!selectedCategoryId ? "category-active" : ""}`}
            onClick={() => setSelectedCategory(null)}
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
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
              {canDeleteCategory && (
                <button
                  type="button"
                  className="btn-admin-icon btn-danger"
                  title="Delete category"
                  onClick={() => handleDeleteCategory(cat.id)}
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
              onClick={() => navigate("/store/new-category")}
              title="New category"
            >
              <Plus size={16} /> New Category
            </button>
          )}
          {canCreateProduct && categories.length > 0 && (
            <button
              type="button"
              className="btn-admin-action"
              onClick={() => navigate("/store/new-product")}
              title="New product"
            >
              <Plus size={16} /> New Product
            </button>
          )}
          {isAuthenticated && (
            <>
              <button
                type="button"
                className="btn-admin-action store-wallet-button"
                onClick={() => navigate(`/wallet/${crypto.randomUUID()}`)}
                title="My Wallet"
              >
                <Wallet size={16} /> Wallet
              </button>
              <button
                type="button"
                className="btn-admin-action store-orders-button"
                onClick={() => navigate("/store/orders")}
                title="My Orders"
              >
                My Orders
              </button>
            </>
          )}
        </div>
      </div>

      {/* Products */}
      <div className="products-section">
        {loading ? (
          <div className="products-grid">
            {PRODUCT_SKELETON_KEYS.map((key) => (
              <SkeletonCard key={key} />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="products-grid">
            {products.map((product) => (
              <InlineProduct
                key={product.id}
                product={product}
                canEdit={canEditProduct}
                canDelete={canDeleteProduct}
                onEdit={setEditingProduct}
                onDelete={handleDeleteProduct}
                onAddToCart={handleAddToCart}
                onImagePreview={setSelectedImage}
              />
            ))}
          </div>
        ) : (
          <div className="ui-empty empty-state">
            <Package size={48} />
            <h3>No items available</h3>
            <p>
              {canCreateProduct
                ? "Create your first product with the button above."
                : "Check back later for new products!"}
            </p>
          </div>
        )}
      </div>

      {selectedImage &&
        typeof document !== "undefined" &&
        createPortal(
          <button
            type="button"
            className="up-upload-lightbox"
            aria-label="Close image preview"
            onClick={() => setSelectedImage(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSelectedImage(null);
              }
            }}
          >
            <span className="up-upload-lightbox-content">
              <img
                src={selectedImage}
                alt="Preview"
              />
            </span>
          </button>,
          document.body,
        )}

      {/* Admin dialogs */}
      {editingProduct && (
        <EditProductDialog
          isOpen={!!editingProduct}
          product={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSuccess={loadCatalog}
        />
      )}
    </div>
  );
};

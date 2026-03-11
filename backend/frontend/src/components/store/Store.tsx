import { useState, useEffect, useCallback, useRef } from "react";
import { ShoppingCart, Package, Plus, Edit2, Trash2, Tag } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
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
  type Product,
  type StoreCategory,
} from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { SkeletonCard } from "../ui/SkeletonCard";
import { CreateStoreCategoryDialog } from "./CreateStoreCategoryDialog";
import { CreateProductDialog } from "./CreateProductDialog";
import { EditProductDialog } from "./EditProductDialog";
import "./Store.css";
import "./EmptyState.css";

export const Store: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] =
    useState(false);
  const [showCreateProductDialog, setShowCreateProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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

  // ── Permissions ───────────────────────────────────────────────────────────
  const canCreateProduct =
    currentUser?.permissions?.includes("store.product-new");
  const canEditProduct =
    currentUser?.permissions?.includes("store.product-edit");
  const canDeleteProduct = currentUser?.permissions?.includes(
    "store.product-delete",
  );
  const canManageCategories = currentUser?.permissions?.includes(
    "store.manageCategories",
  );
  const canCreateCategory = canManageCategories;
  const canDeleteCategory = canManageCategories;

  // ── Load catalog ──────────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, prods] = await Promise.all([
        apiRequest<StoreCategory[]>("/store/categories"),
        apiRequest<Product[]>("/store/products"),
      ]);
      if (Array.isArray(cats)) setCategories(cats);
      if (Array.isArray(prods)) setProducts(prods);

      // Subscribe to per-category updates so admin mutations propagate
      if (Array.isArray(cats)) {
        cats.forEach((c) => subscribe("store_category", c.id));
      }
    } catch (err) {
      console.error("Error loading store catalog:", err);
    } finally {
      setLoading(false);
    }
  }, [setCategories, setProducts, subscribe]);

  // ── Load user's backend cart (authenticated) ──────────────────────────────
  const loadCart = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const resp = await apiRequest<{ items: any[] }>("/store/cart");
      if (resp && Array.isArray(resp.items)) {
        setCartItems(resp.items);
      }
    } catch {
      // silent — cart may be empty
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
      return; // skip the initial mount — initial load is handled above
    }
    if (socket) {
      loadCatalog();
      loadCart();
    }
  }, [socket, loadCatalog, loadCart]);

  // ── Cart actions ──────────────────────────────────────────────────────────
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

  // ── Admin actions ─────────────────────────────────────────────────────────
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
      {/* ── Categories ────────────────────────────────────────────────── */}
      <div className="categories-section">
        <div className="categories-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Tag size={20} />
            <span style={{ fontWeight: 600 }}>Categories</span>
          </div>
          {canCreateCategory && (
            <button
              className="btn-admin-action"
              onClick={() => setShowCreateCategoryDialog(true)}
              title="Create category"
            >
              <Plus size={16} /> New Category
            </button>
          )}
        </div>
        <div className="category-list">
          <button
            className={`category-button ${!selectedCategoryId ? "category-active" : ""}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </button>
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <button
                className={`category-button ${
                  selectedCategoryId === cat.id ? "category-active" : ""
                }`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </button>
              {canDeleteCategory && (
                <button
                  className="btn-admin-icon btn-danger"
                  title="Delete category"
                  onClick={() => handleDeleteCategory(cat.id)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Products ──────────────────────────────────────────────────── */}
      <div className="products-section">
        <div className="products-header">
          <h2>
            <ShoppingCart size={24} className="header-icon" />
            {selectedCategoryId
              ? (categories.find((c) => c.id === selectedCategoryId)?.name ??
                "Products")
              : "Featured Items"}
          </h2>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {canCreateProduct && (
              <button
                className="btn-admin-action"
                onClick={() => setShowCreateProductDialog(true)}
                title="Create product"
              >
                <Plus size={16} /> New Product
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="products-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="products-grid">
            {products.map((product) => (
              <div key={product.id} className="product-card">
                {product.image_url ? (
                  <div className="product-image">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                ) : (
                  <div className="product-image">
                    <Package size={48} />
                  </div>
                )}
                <div className="product-content">
                  <h3 className="product-title">{product.name}</h3>
                  <p className="product-description">{product.description}</p>
                  {!product.stock_unlimited &&
                    product.stock <= 5 &&
                    product.stock > 0 && (
                      <p className="product-stock-warning">
                        Only {product.stock} left!
                      </p>
                    )}
                  {!product.stock_unlimited && product.stock === 0 && (
                    <p className="product-out-of-stock">Out of stock</p>
                  )}
                  <div className="product-footer">
                    <div>
                      {product.original_price != null &&
                        product.original_price > product.price && (
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.85rem",
                              color: "var(--text-secondary)",
                              textDecoration: "line-through",
                            }}
                          >
                            ${product.original_price.toFixed(2)}
                          </span>
                        )}
                      <span className="product-price">
                        ${product.price.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {canEditProduct && (
                        <button
                          className="btn-admin-icon"
                          title="Edit product"
                          onClick={() => setEditingProduct(product)}
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {canDeleteProduct && (
                        <button
                          className="btn-admin-icon btn-danger"
                          title="Delete product"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button
                        className="btn-add-to-cart"
                        onClick={() => handleAddToCart(product)}
                        disabled={
                          !product.stock_unlimited && product.stock === 0
                        }
                      >
                        {!product.stock_unlimited && product.stock === 0
                          ? "Sold Out"
                          : "Add"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
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

      {/* ── Admin dialogs ─────────────────────────────────────────────── */}
      {showCreateCategoryDialog && (
        <CreateStoreCategoryDialog
          isOpen={showCreateCategoryDialog}
          onClose={() => setShowCreateCategoryDialog(false)}
          onSuccess={loadCatalog}
        />
      )}
      {showCreateProductDialog && (
        <CreateProductDialog
          isOpen={showCreateProductDialog}
          categories={categories}
          onClose={() => setShowCreateProductDialog(false)}
          onSuccess={loadCatalog}
        />
      )}
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

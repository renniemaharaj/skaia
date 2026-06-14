import { useState, useEffect, useCallback, useRef } from "react";
import { Package, Plus, Edit2, Trash2 } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";

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
import SpotlightCard from "../ui/SpotlightCard";

import { EditProductDialog } from "./EditProductDialog";
import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import "./Store.css";

export const Store: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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
        catsRes.forEach((c) => subscribe("store_category", c.id));
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
      const resp = await apiRequest<{ items: any[] }>("/store/cart");
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
          {canCreateCategory && (
            <button
              className="btn-admin-action"
              onClick={() => navigate("/store/new-category")}
              title="New category"
            >
              <Plus size={16} /> New Category
            </button>
          )}
          {canCreateProduct && categories.length > 0 && (
            <button
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
                className="btn-admin-action"
                style={{ marginLeft: "auto", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                onClick={() => navigate(`/wallet/${crypto.randomUUID()}`)}
                title="My Wallet"
              >
                <Wallet size={16} /> Wallet
              </button>
              <button
                className="btn-admin-action"
                style={{ marginLeft: "8px" }}
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
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="products-grid">
            {products.map((product) => (
              <SpotlightCard
                key={product.id}
                className="card card--interactive card--store product-card"
                spotlightColor="rgba(255,255,255,0.15)"
                style={{ padding: 0 }}
              >
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
                          className="action-btn edit-btn"
                          title="Edit product"
                          onClick={() => setEditingProduct(product)}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDeleteProduct && (
                        <button
                          className="action-btn danger"
                          title="Delete product"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          <Trash2 size={16} />
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
              </SpotlightCard>
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

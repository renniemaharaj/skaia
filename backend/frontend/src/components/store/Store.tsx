import { useState, useEffect, useCallback, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import "./ProductPage.css";
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

import { EditProductDialog } from "./EditProductDialog";
import { useNavigate } from "react-router-dom";
import "./Store.css";
import { ImageLightbox } from "./ImageLightbox";
import { StoreCategoryBar } from "./StoreCategoryBar";
import { StoreProductGrid } from "./StoreProductGrid";

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
      <StoreCategoryBar
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        canCreateCategory={canCreateCategory}
        canCreateProduct={canCreateProduct}
        canDeleteCategory={canDeleteCategory}
        isAuthenticated={isAuthenticated}
        onSelectCategory={setSelectedCategory}
        onDeleteCategory={handleDeleteCategory}
        onNavigate={navigate}
      />

      <StoreProductGrid
        loading={loading}
        products={products}
        canCreateProduct={canCreateProduct}
        canEditProduct={canEditProduct}
        canDeleteProduct={canDeleteProduct}
        onEditProduct={setEditingProduct}
        onDeleteProduct={handleDeleteProduct}
        onAddToCart={handleAddToCart}
        onImagePreview={setSelectedImage}
      />

      <ImageLightbox
        imageUrl={selectedImage}
        onClose={() => setSelectedImage(null)}
      />

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

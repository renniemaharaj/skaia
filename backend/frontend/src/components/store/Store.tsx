import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import "./ProductPage.css";
import { currentUserAtom, isAuthenticatedAtom, socketAtom } from "../../atoms/auth";
import {
  type CartItem,
  type Order,
  type Product,
  type StoreCategory,
  productCategoriesAtom,
  productsAtom,
  ordersAtom,
  storeCartItemsAtom,
} from "../../atoms/store";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

import { useNavigate, useSearchParams } from "react-router-dom";
import { EditProductDialog } from "./EditProductDialog";
import "./Store.css";
import { MediaPreviewLightbox, type PreviewMediaItem } from "../ui/MediaPreviewLightbox";
import { StoreCategoryBar } from "./StoreCategoryBar";
import { StoreProductGrid } from "./StoreProductGrid";
import { getProductMediaItems } from "./storeMedia";

export type StoreSortMode = "newest" | "oldest" | "price-asc" | "price-desc" | "rating-desc";
export type StoreViewMode = "grid" | "wide";

export interface StoreFilterState {
  search: string;
  categoryIds: string[];
  minPrice: string;
  maxPrice: string;
  minRating: string;
  ownerUserId: string;
  ownerLabel: string;
  sort: StoreSortMode;
}

interface ProductRatingSummary {
  averageRating: number;
  reviewCount: number;
}

const DEFAULT_STORE_FILTERS: StoreFilterState = {
  search: "",
  categoryIds: [],
  minPrice: "",
  maxPrice: "",
  minRating: "0",
  ownerUserId: "",
  ownerLabel: "",
  sort: "newest",
};

const parsePriceFilter = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
};

const isOpenOrderStatus = (status?: string) =>
  !["completed", "failed", "cancelled", "rejected"].includes(status || "pending");

const hasPendingVendorWork = (order: Order) => {
  if (Array.isArray(order.vendors) && order.vendors.length > 0) {
    return order.vendors.some(vendor => isOpenOrderStatus(vendor.status));
  }
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.some(item => isOpenOrderStatus(item.vendor_status || order.status));
  }
  return isOpenOrderStatus(order.status);
};

export const Store: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{
    items: PreviewMediaItem[];
    index: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<StoreViewMode>("grid");
  const [filters, setFilters] = useState<StoreFilterState>(DEFAULT_STORE_FILTERS);
  const [productRatings, setProductRatings] = useState<Record<string, ProductRatingSummary>>({});
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryQuery = searchParams.get("category");

  const currentUser = useAtomValue(currentUserAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const categories = useAtomValue(productCategoriesAtom);
  const products = useAtomValue(productsAtom);
  const userOrders = useAtomValue(ordersAtom);

  const setProducts = useSetAtom(productsAtom);
  const setCategories = useSetAtom(productCategoriesAtom);
  const setCartItems = useSetAtom(storeCartItemsAtom);
  const setOrders = useSetAtom(ordersAtom);

  const { subscribe, unsubscribe } = useWebSocketSync();

  const [guestSandboxMode] = useGuestSandboxMode();

  // Permissions
  const canCreateProduct =
    currentUser?.permissions?.includes("store.product-new") ||
    currentUser?.permissions?.includes("store.product-seller") ||
    guestSandboxMode;
  const hasGlobalProductEdit =
    currentUser?.permissions?.includes("store.product-edit") || guestSandboxMode;
  const hasGlobalProductDelete =
    currentUser?.permissions?.includes("store.product-delete") || guestSandboxMode;
  const isSeller = currentUser?.permissions?.includes("store.product-seller");
  const ownsProduct = (product: Product) =>
    !!currentUser && !!product.owner_id && String(product.owner_id) === String(currentUser.id);
  const canEditProduct = (product: Product) =>
    hasGlobalProductEdit || (!!isSeller && ownsProduct(product));
  const canDeleteProduct = (product: Product) =>
    hasGlobalProductDelete || (!!isSeller && ownsProduct(product));
  const canManageCategories =
    currentUser?.permissions?.includes("store.manageCategories") || guestSandboxMode;
  const canCreateCategory = canManageCategories || guestSandboxMode;
  const canDeleteCategory = canManageCategories || guestSandboxMode;

  const categoryNameById = useMemo(
    () => new Map(categories.map(category => [category.id, category.name])),
    [categories]
  );

  const visibleProducts = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const selectedCategoryIds = new Set(filters.categoryIds);
    let minPrice = parsePriceFilter(filters.minPrice);
    let maxPrice = parsePriceFilter(filters.maxPrice);
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      [minPrice, maxPrice] = [maxPrice, minPrice];
    }
    const minRating = Number.parseFloat(filters.minRating) || 0;

    return products
      .filter(product => {
        if (!product.is_active) return false;
        if (selectedCategoryIds.size > 0 && !selectedCategoryIds.has(product.category_id)) {
          return false;
        }
        if (filters.ownerUserId && String(product.owner_id || "") !== filters.ownerUserId) {
          return false;
        }
        if (minPrice !== null && product.price < minPrice) return false;
        if (maxPrice !== null && product.price > maxPrice) return false;

        const rating = productRatings[product.id]?.averageRating ?? 0;
        if (minRating > 0 && rating < minRating) return false;

        if (!search) return true;

        const categoryName = categoryNameById.get(product.category_id) ?? "";
        return [
          product.name,
          product.description,
          categoryName,
          product.owner?.display_name,
          product.owner_id,
        ].some(value => String(value || "").toLowerCase().includes(search));
      })
      .sort((a, b) => {
        switch (filters.sort) {
          case "oldest":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case "price-asc":
            return a.price - b.price;
          case "price-desc":
            return b.price - a.price;
          case "rating-desc":
            return (
              (productRatings[b.id]?.averageRating ?? 0) -
                (productRatings[a.id]?.averageRating ?? 0) ||
              (productRatings[b.id]?.reviewCount ?? 0) - (productRatings[a.id]?.reviewCount ?? 0)
            );
          case "newest":
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
  }, [categoryNameById, filters, productRatings, products]);

  const handleToggleCategory = (categoryId: string) => {
    setFilters(prev => {
      const selected = new Set(prev.categoryIds);
      if (selected.has(categoryId)) {
        selected.delete(categoryId);
      } else {
        selected.add(categoryId);
      }
      return { ...prev, categoryIds: Array.from(selected) };
    });
  };

  useEffect(() => {
    if (!categoryQuery) return;
    setFilters(prev =>
      prev.categoryIds.includes(categoryQuery) ? prev : { ...prev, categoryIds: [categoryQuery] }
    );
  }, [categoryQuery]);

  const handleClearFilters = () => {
    setFilters(DEFAULT_STORE_FILTERS);
  };

  const handleToggleOwnProducts = () => {
    if (!currentUser) return;
    setFilters(prev => {
      const ownID = String(currentUser.id);
      if (prev.ownerUserId === ownID) {
        return { ...prev, ownerUserId: "", ownerLabel: "" };
      }
      return {
        ...prev,
        ownerUserId: ownID,
        ownerLabel: currentUser.display_name || currentUser.username || "You",
      };
    });
  };

  const handleChangeViewMode = (nextViewMode: StoreViewMode) => {
    setViewMode(nextViewMode);
  };

  const handlePreviewProductMedia = (product: Product, index = 0) => {
    const items = getProductMediaItems(product);
    if (items.length === 0) return;
    setSelectedMedia({
      items,
      index: Math.min(Math.max(index, 0), items.length - 1),
    });
  };

  // Load catalog
  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const [catsRes, prodsRes] = await Promise.all([
        apiRequest<StoreCategory[]>("/store/categories"),
        apiRequest<Product[]>("/store/products"),
      ]);
      setCategories(Array.isArray(catsRes) ? catsRes : []);
      const loadedProducts = Array.isArray(prodsRes) ? prodsRes : [];
      setProducts(loadedProducts);

      // Subscribe to per-category updates so admin mutations propagate
      if (Array.isArray(catsRes)) {
        for (const category of catsRes) {
          subscribe("store_category", category.id);
        }
      }
      setLoading(false);

      const ratingEntries = await Promise.all(
        loadedProducts.map(async product => {
          try {
            const reviews = await apiRequest<Array<{ rating?: number }>>(
              `/store/products/${product.id}/reviews`
            );
            const ratings = Array.isArray(reviews)
              ? reviews.map(review => Number(review.rating) || 0).filter(rating => rating > 0)
              : [];
            const averageRating =
              ratings.length > 0
                ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
                : 0;
            return [product.id, { averageRating, reviewCount: ratings.length }] as const;
          } catch {
            return [product.id, { averageRating: 0, reviewCount: 0 }] as const;
          }
        })
      );
      setProductRatings(Object.fromEntries(ratingEntries));
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

  const loadStoreBadges = useCallback(async () => {
    if (!isAuthenticated) {
      setWalletBalance(null);
      setPendingOrderCount(0);
      return;
    }
    try {
      const [wallet, orders] = await Promise.all([
        apiRequest<{ balance?: number }>("/store/wallet"),
        apiRequest<Order[]>("/store/orders?limit=100"),
      ]);
      setWalletBalance(typeof wallet?.balance === "number" ? wallet.balance : 0);
      if (Array.isArray(orders)) {
        setOrders(orders);
      }
      const pending = Array.isArray(orders) ? orders.filter(hasPendingVendorWork).length : 0;
      setPendingOrderCount(pending);
    } catch {
      setWalletBalance(null);
      setPendingOrderCount(0);
    }
  }, [isAuthenticated, setOrders]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setPendingOrderCount(userOrders.filter(hasPendingVendorWork).length);
  }, [isAuthenticated, userOrders]);

  useEffect(() => {
    if (!isAuthenticated) return;
    for (const order of userOrders) {
      subscribe("order", order.id);
    }
    return () => {
      for (const order of userOrders) {
        unsubscribe("order", order.id);
      }
    };
  }, [isAuthenticated, subscribe, unsubscribe, userOrders]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  useEffect(() => {
    loadStoreBadges();
  }, [loadStoreBadges]);

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
      loadStoreBadges();
    }
  }, [socket, loadCatalog, loadCart, loadStoreBadges]);

  // Cart actions
  const handleAddToCart = async (product: Product) => {
    if (!isAuthenticated) {
      // Optimistic local-only cart for guests
      setCartItems(prev => {
        const existing = prev.find(i => i.product_id === product.id);
        if (existing) {
          return prev.map(i =>
            i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
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
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch (err) {
      console.error("Error deleting product:", err);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await apiRequest(`/store/categories/${categoryId}`, { method: "DELETE" });
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      setFilters(prev => ({
        ...prev,
        categoryIds: prev.categoryIds.filter(id => id !== categoryId),
      }));
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  return (
    <div className="store-container">
      <StoreCategoryBar
        categories={categories}
        filters={filters}
        resultCount={visibleProducts.length}
        currentUser={currentUser}
        walletBalance={walletBalance}
        pendingOrderCount={pendingOrderCount}
        canCreateCategory={canCreateCategory}
        canCreateProduct={canCreateProduct}
        canDeleteCategory={canDeleteCategory}
        isAuthenticated={isAuthenticated}
        viewMode={viewMode}
        onChangeFilters={setFilters}
        onChangeViewMode={handleChangeViewMode}
        onToggleOwnProducts={handleToggleOwnProducts}
        onToggleCategory={handleToggleCategory}
        onClearFilters={handleClearFilters}
        onDeleteCategory={handleDeleteCategory}
        onNavigate={navigate}
      />

      <StoreProductGrid
        loading={loading}
        products={visibleProducts}
        canCreateProduct={canCreateProduct}
        canEditProduct={canEditProduct}
        canDeleteProduct={canDeleteProduct}
        viewMode={viewMode}
        onEditProduct={setEditingProduct}
        onDeleteProduct={handleDeleteProduct}
        onAddToCart={handleAddToCart}
        onImagePreview={handlePreviewProductMedia}
      />

      {selectedMedia && (
        <MediaPreviewLightbox
          items={selectedMedia.items}
          index={selectedMedia.index}
          onIndexChange={index => setSelectedMedia(prev => (prev ? { ...prev, index } : prev))}
          onClose={() => setSelectedMedia(null)}
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

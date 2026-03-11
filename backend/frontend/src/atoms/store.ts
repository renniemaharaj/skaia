import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price?: number;
  stock: number;
  stock_unlimited: boolean;
  category_id: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreCategory {
  id: string;
  name: string;
  description?: string;
  display_order?: number;
  created_at: string;
}

export interface CartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  added_at: string;
  // enriched client-side
  product?: Product;
}

export interface Order {
  id: string;
  user_id: string;
  total_price: number;
  status: string; // pending | completed | failed | cancelled
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref?: string;
  amount: number;
  currency: string;
  status: string; // pending | succeeded | failed | cancelled
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CheckoutResponse {
  order: Order;
  payment: Payment;
  client_secret?: string;
  status: string; // "succeeded" | "failed" | "requires_action"
  message?: string;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

export const productsAtom = atomWithStorage<Product[]>("store.products", []);
export const productCategoriesAtom = atomWithStorage<StoreCategory[]>(
  "store.categories",
  [],
);
export const isLoadingStoreAtom = atom(false);
export const selectedCategoryIdAtom = atom<string | null>(null);
export const storeCartItemsAtom = atomWithStorage<CartItem[]>("store.cart", []);

// Derived: products for the currently selected category
export const filteredProductsAtom = atom((get) => {
  const products = get(productsAtom);
  const selected = get(selectedCategoryIdAtom);
  if (!selected) return products.filter((p) => p.is_active);
  return products.filter((p) => p.category_id === selected && p.is_active);
});

// Derived: cart total (uses product prices from productsAtom for accuracy)
export const cartTotalAtom = atom((get) => {
  const items = get(storeCartItemsAtom);
  const products = get(productsAtom);
  return items.reduce((total, item) => {
    const product = products.find((p) => p.id === item.product_id);
    return total + (product?.price ?? 0) * item.quantity;
  }, 0);
});

export const cartItemCountAtom = atom((get) => {
  const items = get(storeCartItemsAtom);
  return items.reduce((count, item) => count + item.quantity, 0);
});

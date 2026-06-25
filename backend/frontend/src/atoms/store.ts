import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { centsToDollars } from "../utils/money";
import { registerResource } from "../utils/wsRegistry";

export interface Product {
  id: string;
  owner_id?: string;
  owner?: {
    id: string;
    display_name: string;
    avatar_url: string;
  };
  name: string;
  description: string;
  price: number;
  original_price?: number;
  stock: number;
  stock_unlimited: boolean;
  category_id: string;
  image_url?: string;
  media?: ProductMedia[];
  is_active: boolean;
  special_actions?: string;
  recent_purchases?: number;
  current_orders?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductMedia {
  url: string;
  filename: string;
  mime_type: string;
  type: "image" | "video" | string;
  size: number;
  created_at: string;
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

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  owner_id?: string;
  owner?: {
    id: string;
    display_name: string;
    avatar_url: string;
  };
  quantity: number;
  price: number;
  vendor_status?: string;
  vendor_note?: string;
  vendor_updated_at?: string;
  created_at: string;
}

export interface OrderVendorStatus {
  vendor_id: string;
  vendor?: {
    id: string;
    display_name: string;
    avatar_url: string;
  };
  status: string;
  items: number;
  total: number;
  updated_at?: string;
}

export interface Order {
  id: string;
  user_id?: string;
  is_guest: boolean;
  guest_email?: string;
  guest_phone?: string;
  delivery_location?: string;
  delivery_date?: string;
  delivery_time?: string;
  extra_info?: string;
  billing_info?: string;
  total_price: number;
  status: string; // pending | completed | failed | cancelled
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  vendors?: OrderVendorStatus[];
  payment?: Payment;
}

export interface ReferenceCode {
  id: string;
  code: string;
  user_id: string;
  incentive_amount: number;
  is_active: boolean;
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

// Atoms

export const productsAtom = atom<Product[]>([]);
export const productCategoriesAtom = atom<StoreCategory[]>([]);
export const ordersAtom = atom<Order[]>([]);
export const currentOrderAtom = atom<Order | null>(null);
export const isLoadingStoreAtom = atom(false);
export const selectedCategoryIdAtom = atom<string | null>(null);
export const storeCartItemsAtom = atomWithStorage<CartItem[]>("store.cart", []);

// Derived: products for the currently selected category
export const filteredProductsAtom = atom(get => {
  const products = get(productsAtom);
  const selected = get(selectedCategoryIdAtom);
  if (!selected) return products.filter(p => p.is_active);
  return products.filter(p => p.category_id === selected && p.is_active);
});

// Derived: cart total (uses product prices from productsAtom for accuracy)
export const cartTotalAtom = atom(get => {
  const items = get(storeCartItemsAtom);
  const products = get(productsAtom);
  const cents = items.reduce((total, item) => {
    const product = products.find(p => p.id === item.product_id);
    return total + (product?.price ?? 0) * item.quantity;
  }, 0);
  return centsToDollars(cents);
});

export const cartItemCountAtom = atom(get => {
  const items = get(storeCartItemsAtom);
  return items.reduce((count, item) => count + item.quantity, 0);
});

const mergeOrder = (prev: Order[], order: Order) => {
  const exists = prev.some(o => String(o.id) === String(order.id));
  return exists
    ? prev.map(o => (String(o.id) === String(order.id) ? { ...o, ...order } : o))
    : [order, ...prev];
};

registerResource(
  "store:update:category_created",
  productCategoriesAtom,
  (prev, data: StoreCategory) =>
    prev.some(c => String(c.id) === String(data.id)) ? prev : [...prev, data]
);
registerResource(
  "store:update:category_updated",
  productCategoriesAtom,
  (prev, data: Partial<StoreCategory>) =>
    prev.map(c => (String(c.id) === String(data.id) ? { ...c, ...data } : c))
);
registerResource(
  "store:update:category_deleted",
  productCategoriesAtom,
  (prev, data: { id?: string | number }) =>
    data?.id ? prev.filter(c => String(c.id) !== String(data.id)) : prev
);

registerResource("store:update:product_created", productsAtom, (prev, data: Product) =>
  prev.some(p => String(p.id) === String(data.id)) ? prev : [...prev, data]
);
registerResource("store:update:product_updated", productsAtom, (prev, data: Partial<Product>) =>
  prev.map(p => (String(p.id) === String(data.id) ? { ...p, ...data } : p))
);
registerResource(
  "store:update:product_deleted",
  productsAtom,
  (prev, data: { id?: string | number }) =>
    data?.id ? prev.filter(p => String(p.id) !== String(data.id)) : prev
);

registerResource("store:update:purchase_success", storeCartItemsAtom, () => []);
registerResource("store:update:purchase_success", ordersAtom, (prev, data: CheckoutResponse) =>
  data?.order ? mergeOrder(prev, { ...data.order, payment: data.payment }) : prev
);
registerResource(
  "store:update:purchase_success",
  currentOrderAtom,
  (prev, data: CheckoutResponse) => {
    if (!prev || !data?.order || String(prev.id) !== String(data.order.id)) return prev;
    return { ...prev, ...data.order, payment: data.payment };
  }
);

registerResource("order:update:order_created", ordersAtom, (prev, data: Order) =>
  data?.id ? mergeOrder(prev, data) : prev
);
registerResource("order:update:order_created", currentOrderAtom, (prev, data: Order) =>
  prev && data?.id && String(prev.id) === String(data.id) ? { ...prev, ...data } : prev
);
registerResource("order:update:order_updated", ordersAtom, (prev, data: Order) =>
  data?.id ? mergeOrder(prev, data) : prev
);
registerResource("order:update:order_updated", currentOrderAtom, (prev, data: Order) =>
  prev && data?.id && String(prev.id) === String(data.id) ? { ...prev, ...data } : prev
);
registerResource(
  "order:update:order_deleted",
  ordersAtom,
  (prev, data: { id?: string | number }) =>
    data?.id ? prev.filter(o => String(o.id) !== String(data.id)) : prev
);
registerResource(
  "order:update:order_deleted",
  currentOrderAtom,
  (prev, data: { id?: string | number }) =>
    prev && data?.id && String(prev.id) === String(data.id) ? null : prev
);

registerResource("cart:update:cart_updated", storeCartItemsAtom, (_prev, data: CartItem[]) =>
  Array.isArray(data) ? data : _prev
);

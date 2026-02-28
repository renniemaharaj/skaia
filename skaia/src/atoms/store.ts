import { atom } from 'jotai';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  addedAt: string;
}

export interface StoreCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export const productsAtom = atom<Product[]>([]);
export const productCategoriesAtom = atom<StoreCategory[]>([]);
export const cartItemsAtom = atom<CartItem[]>([]);
export const isLoadingStoreAtom = atom(false);

export const cartTotalAtom = atom((get) => {
  const items = get(cartItemsAtom);
  const products = get(productsAtom);
  return items.reduce((total, item) => {
    const product = products.find((p) => p.id === item.productId);
    return total + (product?.price || 0) * item.quantity;
  }, 0);
});

export const cartItemCountAtom = atom((get) => {
  const items = get(cartItemsAtom);
  return items.reduce((count, item) => count + item.quantity, 0);
});

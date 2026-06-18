import { SearchX, Store as StoreIcon } from "lucide-react";
import type { Product } from "../../atoms/store";
import { SkeletonCard } from "../ui/SkeletonCard";
import { InlineProduct } from "./InlineProduct";
import type { StoreViewMode } from "./Store";

const PRODUCT_SKELETON_KEYS = [
  "product-skeleton-1",
  "product-skeleton-2",
  "product-skeleton-3",
  "product-skeleton-4",
  "product-skeleton-5",
  "product-skeleton-6",
];

interface StoreProductGridProps {
  loading: boolean;
  products: Product[];
  canCreateProduct: boolean;
  canEditProduct: (product: Product) => boolean;
  canDeleteProduct: (product: Product) => boolean;
  viewMode: StoreViewMode;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onImagePreview: (product: Product, index?: number) => void;
}

export function StoreProductGrid({
  loading,
  products,
  canCreateProduct,
  canEditProduct,
  canDeleteProduct,
  viewMode,
  onEditProduct,
  onDeleteProduct,
  onAddToCart,
  onImagePreview,
}: StoreProductGridProps) {
  if (loading) {
    return (
      <div className="products-section">
        <div className={`products-grid products-grid--${viewMode}`}>
          {PRODUCT_SKELETON_KEYS.map(key => (
            <SkeletonCard key={key} />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    const EmptyIcon = canCreateProduct ? StoreIcon : SearchX;

    return (
      <div className="products-section">
        <div className="ui-empty store-products-empty">
          <EmptyIcon size={20} />
          <h3>No products</h3>
          <p>
            {canCreateProduct
              ? "Create one from the store controls."
              : "Try another category or check back later."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="products-section">
      <div className={`products-grid products-grid--${viewMode}`}>
        {products.map(product => (
          <InlineProduct
            key={product.id}
            product={product}
            canEdit={canEditProduct(product)}
            canDelete={canDeleteProduct(product)}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onAddToCart={onAddToCart}
            onImagePreview={onImagePreview}
          />
        ))}
      </div>
    </div>
  );
}

import { Package } from "lucide-react";
import type { Product } from "../../atoms/store";
import { SkeletonCard } from "../ui/SkeletonCard";
import { InlineProduct } from "./InlineProduct";

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
  canEditProduct: boolean;
  canDeleteProduct: boolean;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onImagePreview: (imageUrl: string) => void;
}

export function StoreProductGrid({
  loading,
  products,
  canCreateProduct,
  canEditProduct,
  canDeleteProduct,
  onEditProduct,
  onDeleteProduct,
  onAddToCart,
  onImagePreview,
}: StoreProductGridProps) {
  if (loading) {
    return (
      <div className="products-section">
        <div className="products-grid">
          {PRODUCT_SKELETON_KEYS.map(key => (
            <SkeletonCard key={key} />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="products-section">
        <div className="ui-empty empty-state">
          <Package size={48} />
          <h3>No items available</h3>
          <p>
            {canCreateProduct
              ? "Create your first product with the button above."
              : "Check back later for new products!"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="products-section">
      <div className="products-grid">
        {products.map(product => (
          <InlineProduct
            key={product.id}
            product={product}
            canEdit={canEditProduct}
            canDelete={canDeleteProduct}
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

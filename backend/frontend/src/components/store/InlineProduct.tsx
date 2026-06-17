import { Link } from "react-router-dom";
import { Clock, Package, Edit2, Trash2, ShoppingBag, TrendingUp, User } from "lucide-react";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import StarRating from "../ui/StarRating";
import { formatCents } from "../../utils/money";
import { type Product } from "../../atoms/store";
import { useProductRatings } from "./ratings";

interface StoreInlineProductProps {
  product: Product;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (product: Product) => void;
  onDelete?: (id: string) => void;
  onAddToCart?: (product: Product) => void;
  onImagePreview?: (url: string) => void;
}

export const InlineProduct = ({
  product,
  canEdit = false,
  canDelete = false,
  onEdit,
  onDelete,
  onAddToCart,
  onImagePreview,
}: StoreInlineProductProps) => {
  const { averageRating, reviewCount } = useProductRatings(product.id);
  const updatedDate = new Date(product.updated_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <ContentFlatCard className="product-card">
      <Link
        to={`/store/product/${product.id}`}
        style={{
          textDecoration: "none",
          color: "inherit",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
        }}
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
                cursor: "pointer",
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                if (onImagePreview) {
                  onImagePreview(product.image_url!);
                }
              }}
            />
          </div>
        ) : (
          <div className="product-image">
            <Package size={48} />
          </div>
        )}

        <div className="product-content" style={{ flexGrow: 1 }}>
          <h3 className="product-title">{product.name}</h3>

          <div className="product-page-price">
            <span className="current-price">{formatCents(product.price)}</span>

            {product.original_price &&
              product.original_price > product.price && (
                <span className="original-price">
                  {formatCents(product.original_price)}
                </span>
              )}
          </div>

          <div className="product-page-rating-summary">
            <StarRating rating={Math.round(averageRating)} disabled size={15} />
            <span>
              {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>

          <p className="product-page-description">
            {product.description.length < 120
              ? product.description
              : `${product.description.slice(0, 120)}...`}
          </p>

          <div className="product-card-meta">
            <span title="Product owner">
              <User size={13} />
              {product.owner?.display_name || "Store"}
            </span>
            <span title="Last updated">
              <Clock size={13} />
              {updatedDate}
            </span>
            <span title="Recent purchases">
              <ShoppingBag size={13} />
              {product.recent_purchases ?? 0}
            </span>
            <span title="Current orders">
              <TrendingUp size={13} />
              {product.current_orders ?? 0}
            </span>
          </div>

          {!product.stock_unlimited && (
            <div className="product-page-stock">
              {product.stock > 0
                ? `${product.stock} available`
                : "Out of Stock"}
            </div>
          )}

          <div
            style={{
              marginTop: "auto",
              paddingTop: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              {canEdit && (
                <button
                  className="action-btn edit-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit?.(product);
                  }}
                >
                  <Edit2 size={16} />
                </button>
              )}

              {canDelete && (
                <button
                  className="action-btn danger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete?.(product.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <button
              className="btn-add-to-cart"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart?.(product);
              }}
              disabled={!product.stock_unlimited && product.stock === 0}
            >
              {!product.stock_unlimited && product.stock === 0
                ? "Sold Out"
                : "Add to Cart"}
            </button>
          </div>
        </div>
      </Link>
    </ContentFlatCard>
  );
};

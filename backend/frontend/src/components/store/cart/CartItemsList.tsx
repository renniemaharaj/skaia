import { ShoppingBag, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { CartItem, Product } from "../../../atoms/store";
import { formatCents } from "../../../utils/money";
import { ContentFlatCard } from "../../cards/ContentFlatCard";

const CART_FILLER_IDS = ["cart-filler-primary", "cart-filler-secondary", "cart-filler-tertiary"];

interface CartItemsListProps {
  items: CartItem[];
  products: Product[];
  loading: boolean;
  onClearCart: () => void;
  onQuantityChange: (productId: string, raw: string) => void;
  onRemove: (productId: string) => void;
}

export function CartItemsList({
  items,
  products,
  loading,
  onClearCart,
  onQuantityChange,
  onRemove,
}: CartItemsListProps) {
  const getProduct = (productId: string) => products.find(product => product.id === productId);
  const showCartFiller = items.length < 5;

  return (
    <div className="cart-items">
      {items.map(item => {
        const product = getProduct(item.product_id);
        const displayName = product?.name ?? `Product #${item.product_id}`;
        return (
          <ContentFlatCard key={item.product_id} className="cart-item cart-checkout-item">
            {product?.image_url && (
              <img src={product.image_url} alt={displayName} className="cart-item-image" />
            )}
            <div className="cart-item-info">
              <h3>{displayName}</h3>
              <p className="cart-item-price">{formatCents(product?.price ?? 0)}</p>
            </div>
            <div className="cart-item-controls">
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={event => onQuantityChange(item.product_id, event.target.value)}
              />
              <button
                type="button"
                className="btn btn-danger"
                title="Remove from cart"
                onClick={() => onRemove(item.product_id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </ContentFlatCard>
        );
      })}

      {showCartFiller && (
        <div className="cart-filler" aria-label="More room in your cart">
          <div className="cart-filler-list" aria-hidden="true">
            {CART_FILLER_IDS.map(fillerId => (
              <ContentFlatCard
                key={fillerId}
                className="cart-item cart-checkout-item cart-filler-item"
              >
                <div className="cart-filler-thumb skeleton" />
                <div className="cart-filler-lines">
                  <div className="cart-filler-line cart-filler-line--title skeleton" />
                  <div className="cart-filler-line cart-filler-line--meta skeleton" />
                </div>
                <div className="cart-filler-action skeleton" />
              </ContentFlatCard>
            ))}
          </div>
          <p className="cart-filler-message">
            Your cart still has room. Add a few more picks before checkout.
          </p>
        </div>
      )}

      <div className="cart-footer-actions">
        <button type="button" className="btn btn-danger" onClick={onClearCart} disabled={loading}>
          <Trash2 size={16} />
          Clear Cart
        </button>
        {items.length < 4 && (
          <Link to="/store" className="btn btn-ghost">
            <ShoppingBag size={16} />
            Continue Shopping
          </Link>
        )}
      </div>
    </div>
  );
}

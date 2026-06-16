import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { CartItem, Product } from "../../../atoms/store";
import { formatCents } from "../../../utils/money";

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

  return (
    <div className="cart-items">
      {items.map(item => {
        const product = getProduct(item.product_id);
        const displayName = product?.name ?? `Product #${item.product_id}`;
        return (
          <div key={item.product_id} className="card card--store cart-item">
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
          </div>
        );
      })}

      <div className="cart-footer-actions">
        <button type="button" className="btn btn-ghost" onClick={onClearCart} disabled={loading}>
          Clear Cart
        </button>
        {items.length < 4 && (
          <Link to="/store" className="btn btn-secondary">
            Continue Shopping
          </Link>
        )}
      </div>
    </div>
  );
}

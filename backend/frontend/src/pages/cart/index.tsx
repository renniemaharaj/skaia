import { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Trash2, Loader } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  storeCartItemsAtom,
  productsAtom,
  cartTotalAtom,
  type CartItem,
} from "../../atoms/store";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import "../../styles/Cart.css";

export const CartPage = () => {
  const [cartItems, setCartItems] = useAtom(storeCartItemsAtom);
  const products = useAtomValue(productsAtom);
  const cartTotal = useAtomValue(cartTotalAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [loading, setLoading] = useState(false);

  const getProduct = (productId: string) =>
    products.find((p) => p.id === productId);

  const handleRemove = async (productId: string) => {
    // Optimistic local update first
    setCartItems((prev) => prev.filter((i) => i.product_id !== productId));
    if (isAuthenticated) {
      try {
        await apiRequest("/store/cart/remove", {
          method: "DELETE",
          body: JSON.stringify({ product_id: Number(productId) }),
        });
      } catch {
        // ignore — atom already updated
      }
    }
  };

  const handleClearCart = async () => {
    setCartItems([]);
    if (isAuthenticated) {
      try {
        await apiRequest("/store/cart", { method: "DELETE" });
      } catch {
        // ignore
      }
    }
  };

  const handleQuantityChange = (productId: string, raw: string) => {
    const qty = parseInt(raw);
    if (!isNaN(qty) && qty > 0) {
      setCartItems((prev) =>
        prev.map((i) =>
          i.product_id === productId ? { ...i, quantity: qty } : i,
        ),
      );
    }
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    setLoading(true);
    try {
      await apiRequest("/store/checkout", {
        method: "POST",
        body: JSON.stringify({
          items: cartItems.map((i: CartItem) => ({
            product_id: i.product_id,
            quantity: i.quantity,
          })),
          currency: "usd",
        }),
      });
      toast.success("Order placed! Check your inbox for confirmation.");
      setCartItems([]);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Checkout failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cart-page-container">
      <div className="cart-header">
        <h1>
          <ShoppingCart size={32} />
          Shopping Cart
        </h1>
      </div>

      {cartItems.length > 0 ? (
        <div className="cart-content">
          <div className="cart-items">
            {cartItems.map((item) => {
              const product = getProduct(item.product_id);
              const displayName =
                product?.name ?? `Product #${item.product_id}`;
              const displayPrice = product?.price ?? 0;
              return (
                <div key={item.product_id} className="cart-item">
                  <div className="cart-item-info">
                    <h3>{displayName}</h3>
                    <p>${displayPrice.toFixed(2)}</p>
                  </div>
                  <div className="cart-item-controls">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        handleQuantityChange(item.product_id, e.target.value)
                      }
                    />
                    <button
                      className="btn btn-secondary"
                      title="Remove from cart"
                      onClick={() => handleRemove(item.product_id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cart-summary">
            <h3>Total: ${cartTotal.toFixed(2)}</h3>
            <button
              className="btn btn-primary"
              onClick={handleCheckout}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader
                    size={16}
                    className="spin"
                    style={{ marginRight: 6 }}
                  />
                  Processing…
                </>
              ) : (
                "Checkout"
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleClearCart}
              disabled={loading}
              style={{ marginTop: "8px" }}
            >
              Clear Cart
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-cart">
          <ShoppingCart size={64} className="empty-cart-icon" />
          <h2>Your cart is empty</h2>
          <p>
            Let's add some items to your cart and make your server experience
            even better!
          </p>
          <Link to="/store" className="btn btn-primary">
            Continue Shopping
          </Link>
        </div>
      )}
    </div>
  );
};

import { Link } from "react-router-dom";
import { ShoppingCart, Trash2 } from "lucide-react";
import { useCart } from "../../context/CartContext";
import "../../styles/Cart.css";

export const CartPage = () => {
  const { items, removeItem, updateQuantity, getTotalPrice, clearCart } =
    useCart();

  const handleCheckout = () => {
    console.log("Checkout clicked");
    alert("Payment failed: Demo mode - transaction error");
    console.log("Attempting to process order with items:", items);
  };

  const handleQuantityChange = (id: string, newQuantity: string) => {
    const quantity = parseInt(newQuantity);
    if (quantity > 0) {
      updateQuantity(id, quantity);
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

      {items.length > 0 ? (
        <div className="cart-content">
          <div className="cart-items">
            {items.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  <p>${item.price.toFixed(2)}</p>
                </div>
                <div className="cart-item-controls">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      handleQuantityChange(item.id, e.target.value)
                    }
                  />
                  <button
                    className="btn btn-secondary"
                    title="Remove from cart"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-summary">
            <h3>Total: ${getTotalPrice().toFixed(2)}</h3>
            <button className="btn btn-primary" onClick={handleCheckout}>
              Checkout
            </button>
            <button
              className="btn btn-secondary"
              onClick={clearCart}
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

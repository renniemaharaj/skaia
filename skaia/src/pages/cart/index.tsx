import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import "../../styles/Cart.css";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export const CartPage = () => {
  // TODO: Connect to actual cart state management
  const cartItems: CartItem[] = [];

  const handleCheckout = () => {
    console.log("Checkout clicked");
    // TODO: Implement checkout logic
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
            {cartItems.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  <p>${item.price}</p>
                </div>
                <div className="cart-item-controls">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const newQuantity = parseInt(e.target.value);
                      if (newQuantity > 0) {
                        // TODO: Update cart
                      }
                    }}
                  />
                  <button
                    className="btn btn-secondary"
                    title="Remove from cart"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-summary">
            <h3>
              Total: $
              {cartItems
                .reduce((sum, item) => sum + item.price * item.quantity, 0)
                .toFixed(2)}
            </h3>
            <button className="btn btn-primary" onClick={handleCheckout}>
              Checkout
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

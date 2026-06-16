import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { CartHeader } from "./CartHeader";

export function EmptyCart() {
  return (
    <div className="cart-page-container">
      <CartHeader />
      <div className="card card--outlined empty-cart">
        <ShoppingCart size={56} className="empty-cart-icon" />
        <h2>Your cart is empty</h2>
        <p>Add some items to your cart to get started.</p>
        <Link to="/store" className="btn btn-primary">
          Browse Store
        </Link>
      </div>
    </div>
  );
}

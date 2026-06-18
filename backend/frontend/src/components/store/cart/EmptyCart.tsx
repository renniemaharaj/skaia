import { ShoppingCart } from "lucide-react";
import { CartHeader } from "./CartHeader";

export function EmptyCart() {
  return (
    <>
      <CartHeader />
      <div className="ui-empty store-products-empty empty-cart--compact">
        <ShoppingCart size={20} className="empty-cart-icon" />
        <h3>No products added</h3>
        <p>Your cart is empty.</p>
      </div>
    </>
  );
}

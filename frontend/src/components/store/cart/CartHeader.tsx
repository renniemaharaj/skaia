import { ShoppingCart } from "lucide-react";

export function CartHeader() {
  return (
    <div className="cart-header">
      <h1>
        <ShoppingCart size={28} />
        Shopping Cart
      </h1>
    </div>
  );
}

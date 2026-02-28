import { Store } from "../../components";
import { useCart } from "../../context/CartContext";

export const StorePage = () => {
  const { addItem } = useCart();

  const handleAddToCart = (product: {
    id: string;
    name: string;
    price: number;
    description?: string;
  }) => {
    addItem(product);
    console.log("Added to cart:", product);
  };

  return <Store onAddToCart={handleAddToCart} />;
};

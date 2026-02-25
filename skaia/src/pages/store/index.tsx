import { Store } from "../../components/Store";

export const StorePage = () => {
  const handleAddToCart = (product: {
    id: string;
    name: string;
    price: number;
  }) => {
    console.log("Added to cart:", product);
    // TODO: Connect to actual cart state management
  };

  return <Store onAddToCart={handleAddToCart} />;
};

import { useState, useEffect } from "react";
import { ShoppingCart, Package, Filter } from "lucide-react";
import "./Store.css";

interface Category {
  id: string;
  name: string;
  description: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
  stock: number;
}

interface StoreProps {
  onAddToCart: (product: Product) => void;
}

const MOCK_CATEGORIES: Category[] = [
  { id: "1", name: "Ranks", description: "Server ranks and permissions" },
  { id: "2", name: "Coins", description: "In-game currency" },
  { id: "3", name: "Crates", description: "Lucky crates" },
  { id: "4", name: "Cosmetics", description: "Skins and cosmetics" },
  { id: "5", name: "Misc", description: "Other items" },
];

const MOCK_PRODUCTS: Product[] = [
  {
    id: "1",
    name: "Starter Rank",
    description: "Begin your adventure",
    price: 4.99,
    stock: 100,
  },
  {
    id: "2",
    name: "Premium Rank",
    description: "Unlock premium features",
    price: 9.99,
    stock: 50,
  },
  {
    id: "3",
    name: "Elite Rank",
    description: "Maximum benefits",
    price: 19.99,
    stock: 25,
  },
  {
    id: "4",
    name: "1000 Coins",
    description: "In-game currency",
    price: 9.99,
    stock: 999,
  },
  {
    id: "5",
    name: "5000 Coins",
    description: "In-game currency",
    price: 39.99,
    stock: 999,
  },
  {
    id: "6",
    name: "Mystery Crate",
    description: "Get random items",
    price: 2.99,
    stock: 200,
  },
  {
    id: "7",
    name: "Legendary Crate",
    description: "Rare drops guaranteed",
    price: 14.99,
    stock: 50,
  },
  {
    id: "8",
    name: "Dragon Wings",
    description: "Cosmetic item",
    price: 7.99,
    stock: 75,
  },
];

export const Store: React.FC<StoreProps> = ({ onAddToCart }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredProducts, setFilteredProducts] = useState(MOCK_PRODUCTS);

  useEffect(() => {
    if (selectedCategory) {
      setFilteredProducts(MOCK_PRODUCTS);
    } else {
      setFilteredProducts(MOCK_PRODUCTS);
    }
  }, [selectedCategory]);

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId === selectedCategory ? null : categoryId);
  };

  return (
    <div className="store-container">
      <div className="store-header">
        <h1>Store</h1>
        <p>
          Support Cueballcraft Skaiacraft and unlock exclusive ranks, cosmetics,
          and items. All purchases are delivered instantly!
        </p>
      </div>

      <div className="categories-section">
        <div className="categories-header">
          <h2>
            <Filter size={24} className="header-icon" />
            Select a Category
          </h2>
        </div>
        <div className="category-list">
          {MOCK_CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`category-button ${
                selectedCategory === category.id ? "active" : ""
              }`}
              onClick={() => handleCategoryClick(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="products-section">
        <div className="products-header">
          <h2>
            <ShoppingCart size={24} className="header-icon" />
            Featured Items
          </h2>
        </div>
        {filteredProducts.length > 0 ? (
          <div className="products-grid">
            {filteredProducts.map((product) => (
              <div key={product.id} className="product-card">
                <div className="product-image">
                  <Package size={48} />
                </div>
                <div className="product-content">
                  <h3 className="product-title">{product.name}</h3>
                  <p className="product-description">{product.description}</p>
                  <div className="product-footer">
                    <span className="product-price">${product.price}</span>
                    <button
                      className="btn-add-to-cart"
                      onClick={() => onAddToCart(product)}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Package size={48} />
            <h3>No items available</h3>
            <p>Check back later for new products!</p>
          </div>
        )}
      </div>
    </div>
  );
};

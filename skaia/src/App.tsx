import { useState, useEffect, useRef } from "react";
import "./App.css";
import { Header } from "./components/Header";
import { Landing } from "./components/Landing";
import { Store } from "./components/Store";
import { Forum } from "./components/Forum";
import { Trash2 } from "lucide-react";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function App() {
  const [currentSection, setCurrentSection] = useState<
    "home" | "store" | "forum" | "cart"
  >("home");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [notifications, setNotifications] = useState<string>("");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    // Default to light mode
    return false;
  });
  const wsRef = useRef<WebSocket | null>(null);

  // Set theme on mount
  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }, [isDarkMode]);

  // Initialize WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("Connected to WebSocket");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("WebSocket message:", message);

          // Handle different message types
          switch (message.type) {
            case "store:update":
              handleStoreUpdate(message.payload);
              break;
            case "forum:update":
              handleForumUpdate(message.payload);
              break;
            default:
              break;
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("Disconnected from WebSocket");
      };
    } catch (error) {
      console.error("Failed to establish WebSocket connection:", error);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleStoreUpdate = (payload: unknown) => {
    console.log("Store update:", payload);
    // Handle store updates from WebSocket
  };

  const handleForumUpdate = (payload: unknown) => {
    console.log("Forum update:", payload);
    // Handle forum updates from WebSocket
  };

  const handleAddToCart = (product: {
    id: string;
    name: string;
    price: number;
  }) => {
    const existingItem = cartItems.find((item) => item.id === product.id);

    if (existingItem) {
      setCartItems(
        cartItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      );
    } else {
      setCartItems([...cartItems, { ...product, quantity: 1 }]);
    }

    // Send update via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "store:update",
          payload: { action: "add_to_cart", product },
        }),
      );
    }

    setNotifications(`${product.name} added to cart!`);
    setTimeout(() => setNotifications(""), 3000);
  };

  const handleThreadCreate = (thread: { title: string; content: string }) => {
    // Send new thread via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "forum:update",
          payload: { action: "create_thread", thread },
        }),
      );
    }

    setNotifications("Thread created successfully!");
    setTimeout(() => setNotifications(""), 3000);
  };

  const handleThreadDelete = (id: string) => {
    // Send delete thread via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "forum:update",
          payload: { action: "delete_thread", threadId: id },
        }),
      );
    }

    setNotifications("Thread deleted successfully!");
    setTimeout(() => setNotifications(""), 3000);
  };

  const handleThreadUpdate = (
    id: string,
    thread: { title: string; content: string },
  ) => {
    // Send update thread via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "forum:update",
          payload: { action: "update_thread", threadId: id, thread },
        }),
      );
    }

    setNotifications("Thread updated successfully!");
    setTimeout(() => setNotifications(""), 3000);
  };

  const processCart = async () => {
    if (cartItems.length === 0) {
      setNotifications("Cart is empty!");
      setTimeout(() => setNotifications(""), 3000);
      return;
    }

    try {
      // Send cart to server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "store:process_cart",
            payload: { items: cartItems },
          }),
        );

        setNotifications("Processing your order...");

        // Clear cart after successful processing
        setTimeout(() => {
          setCartItems([]);
          setNotifications("Order processed successfully!");
          setTimeout(() => {
            setNotifications("");
            setCurrentSection("home");
          }, 2000);
        }, 1500);
      } else {
        setNotifications("Not connected to server. Please try again.");
        setTimeout(() => setNotifications(""), 3000);
      }
    } catch (error) {
      console.error("Error processing cart:", error);
      setNotifications("Failed to process order. Please try again.");
      setTimeout(() => setNotifications(""), 3000);
    }
  };

  const handleNavigate = (section: string) => {
    if (["home", "store", "forum", "cart"].includes(section)) {
      setCurrentSection(section as "home" | "store" | "forum" | "cart");
    }
  };

  const handleDarkModeToggle = (isDark: boolean) => {
    setIsDarkMode(isDark);
  };

  return (
    <div className="app">
      <Header
        cartCount={cartItems.length}
        onNavigate={handleNavigate}
        onHome={() => setCurrentSection("home")}
        currentSection={currentSection}
        isDarkMode={isDarkMode}
        onDarkModeToggle={handleDarkModeToggle}
      />

      {notifications && <div className="notification">{notifications}</div>}

      <main className="main-content">
        <div className="container">
          {currentSection === "home" && <Landing onNavigate={handleNavigate} />}
          {currentSection === "store" && (
            <Store onAddToCart={handleAddToCart} />
          )}
          {currentSection === "forum" && (
            <Forum
              onThreadCreate={handleThreadCreate}
              onThreadDelete={handleThreadDelete}
              onThreadUpdate={handleThreadUpdate}
            />
          )}
          {currentSection === "cart" && (
            <div className="cart-section">
              <h1>Shopping Cart</h1>
              {cartItems.length > 0 ? (
                <div>
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
                                setCartItems(
                                  cartItems.map((i) =>
                                    i.id === item.id
                                      ? { ...i, quantity: newQuantity }
                                      : i,
                                  ),
                                );
                              }
                            }}
                          />
                          <button
                            className="btn btn-secondary"
                            onClick={() =>
                              setCartItems(
                                cartItems.filter((i) => i.id !== item.id),
                              )
                            }
                            title="Remove from cart"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="cart-summary">
                    <h3>
                      Total: $
                      {cartItems
                        .reduce(
                          (sum, item) => sum + item.price * item.quantity,
                          0,
                        )
                        .toFixed(2)}
                    </h3>
                    <button className="btn btn-primary" onClick={processCart}>
                      Checkout
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-cart">
                  <p>Your cart is empty</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleNavigate("store")}
                  >
                    Continue Shopping
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>&copy; 2025 Cueballcraft Skaiacraft. All rights reserved.</p>
          <div className="footer-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#contact">Contact Us</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { ShoppingCart, Moon, Sun, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./Header.css";

interface HeaderProps {
  cartCount: number;
  isDarkMode: boolean;
  onDarkModeToggle: (isDark: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  isDarkMode,
  onDarkModeToggle,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDarkModeToggle = () => {
    const newDarkMode = !isDarkMode;
    onDarkModeToggle(newDarkMode);
    document.documentElement.setAttribute(
      "data-theme",
      newDarkMode ? "dark" : "light",
    );
    localStorage.setItem("theme", newDarkMode ? "dark" : "light");
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const isActive = (path: string) => {
    return location.pathname === path ? "active" : "";
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <img
            src="/logo.png"
            alt="Cueballcraft Skaiacraft"
            className="logo-img"
          />
          <div className="logo-info">
            <span className="logo-title">CUEBALLCRAFT</span>
            <span className="logo-subtitle">Skaiacraft</span>
          </div>
        </Link>

        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <nav className={`nav ${menuOpen ? "open" : ""}`}>
          <div className="nav-section">
            <Link
              to="/"
              className={isActive("/")}
              onClick={() => setMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              to="/store"
              className={isActive("/store")}
              onClick={() => setMenuOpen(false)}
            >
              Store
            </Link>
            <Link
              to="/forum"
              className={isActive("/forum")}
              onClick={() => setMenuOpen(false)}
            >
              Forum
            </Link>
          </div>

          <div className="user-section">
            <button
              className="theme-toggle"
              onClick={handleDarkModeToggle}
              title="Toggle dark mode"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div
              className="cart-icon"
              onClick={() => handleNavigation("/cart")}
              title="Shopping Cart"
              style={{ cursor: "pointer" }}
            >
              <ShoppingCart size={20} />
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </div>
            <button className="btn btn-secondary">Login</button>
          </div>
        </nav>
      </div>
    </header>
  );
};

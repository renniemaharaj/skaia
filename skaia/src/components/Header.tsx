import { ShoppingCart, Moon, Sun, Menu, X, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./Header.css";
import { useThemeContext } from "../hooks/theme/useThemeContext";

interface HeaderProps {
  cartCount: number;
  isDarkMode: boolean;
  onDarkModeToggle: (isDark: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  isDarkMode,
  // onDarkModeToggle,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { theme, specifyTheme } = useThemeContext();

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const userData = localStorage.getItem("user");
    setIsAuthenticated(!!token);
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleNavigation = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleSetTheme = () => {
    specifyTheme(theme === "dark" ? "light" : "dark");
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setIsAuthenticated(false);
    setUser(null);
    navigate("/");
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
              onClick={handleSetTheme}
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
            {isAuthenticated && user ? (
              <div className="user-menu">
                <span className="user-name">{user.username || user.email}</span>
                <button
                  className="btn btn-secondary"
                  onClick={handleLogout}
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <div className="auth-buttons">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleNavigation("/login")}
                >
                  Sign in
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};

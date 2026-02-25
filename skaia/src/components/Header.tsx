import { ShoppingCart, Moon, Sun, Menu, X } from "lucide-react";
import { useState } from "react";
import "./Header.css";

interface HeaderProps {
  cartCount: number;
  onNavigate: (section: string) => void;
  onHome: () => void;
  currentSection: string;
  isDarkMode: boolean;
  onDarkModeToggle: (isDark: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  onNavigate,
  onHome,
  currentSection,
  isDarkMode,
  onDarkModeToggle,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDarkModeToggle = () => {
    const newDarkMode = !isDarkMode;
    onDarkModeToggle(newDarkMode);
    document.documentElement.setAttribute(
      "data-theme",
      newDarkMode ? "dark" : "light",
    );
    localStorage.setItem("theme", newDarkMode ? "dark" : "light");
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo" onClick={onHome} style={{ cursor: "pointer" }}>
          <img
            src="/logo.png"
            alt="Cueballcraft Skaiacraft"
            className="logo-img"
          />
          <div className="logo-info">
            <span className="logo-title">CUEBALLCRAFT</span>
            <span className="logo-subtitle">Skaiacraft</span>
          </div>
        </div>

        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <nav className={`nav ${menuOpen ? "open" : ""}`}>
          <div className="nav-section">
            <a
              href="#home"
              className={currentSection === "home" ? "active" : ""}
              onClick={() => {
                onHome();
                setMenuOpen(false);
              }}
            >
              Home
            </a>
            <a
              href="#store"
              className={currentSection === "store" ? "active" : ""}
              onClick={() => {
                onNavigate("store");
                setMenuOpen(false);
              }}
            >
              Store
            </a>
            <a
              href="#forum"
              className={currentSection === "forum" ? "active" : ""}
              onClick={() => {
                onNavigate("forum");
                setMenuOpen(false);
              }}
            >
              Forum
            </a>
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
              onClick={() => {
                onNavigate("cart");
                setMenuOpen(false);
              }}
              title="Shopping Cart"
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

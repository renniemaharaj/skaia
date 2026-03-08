import { ShoppingCart, Moon, Sun, Menu, X, LogOut, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAtomValue, useSetAtom } from "jotai";
import {
  isAuthenticatedAtom,
  currentUserAtom,
  accessTokenAtom,
  refreshTokenAtom,
  hasPermissionAtom,
} from "../../atoms/auth";
import { inboxUnreadCountAtom } from "../../atoms/inbox";
import { brandingAtom } from "../../atoms/config";
import { apiRequest } from "../../utils/api";
import {
  EditableText,
  ImagePickerButton,
  VariantCycler,
} from "../landing/EditControls";
import UserLink from "../user/UserLink";
import NotificationBell from "../notifications/NotificationBell";
import "./Header.css";
import { useThemeContext } from "../../hooks/theme/useThemeContext";
import { toast } from "sonner";
import type { Branding } from "../landing/types";

const MENU_VARIANTS = 2;

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
  const navigate = useNavigate();
  const location = useLocation();

  // Use Jotai atoms for auth state
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(currentUserAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const setIsAuthenticated = useSetAtom(isAuthenticatedAtom);
  const inboxUnread = useAtomValue(inboxUnreadCountAtom);

  // Branding + edit permission
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canEdit = hasPermission("home.manage");
  const branding = useAtomValue(brandingAtom);
  const setBranding = useSetAtom(brandingAtom);

  const logoUrl = branding?.logo_url || "/logo.png";
  const headerTitle =
    branding?.header_title || branding?.site_name || "CUEBALLCRAFT";
  const headerSubtitle = branding?.header_subtitle || "Skaiacraft";
  const menuVariant = branding?.menu_variant || 1;

  const saveBranding = async (updates: Partial<Branding>) => {
    const updated = { ...branding, ...updates } as Branding;
    try {
      await apiRequest("/config/branding", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      setBranding(updated);
      toast.success("Branding saved");
    } catch {
      toast.error("Failed to save branding");
    }
  };

  const { theme, specifyTheme } = useThemeContext();

  const handleNavigation = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleSetTheme = () => {
    specifyTheme(theme === "dark" ? "light" : "dark");
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      // Clear all auth atoms (atomWithStorage will also clear localStorage)
      setAccessToken(null);
      setRefreshToken(null);
      setCurrentUser(null);
      setIsAuthenticated(false);
      navigate("/");
      setMenuOpen(false);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path ? "active" : "";
  };

  const logoContent = (
    <>
      <div className="logo-img-wrapper">
        <img src={logoUrl} alt={headerTitle} className="logo-img" />
        {canEdit && (
          <div
            className="logo-edit-controls"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ImagePickerButton
              onUploaded={(url) => saveBranding({ logo_url: url })}
              className="logo-img-edit"
            />
          </div>
        )}
      </div>
      <div className="logo-info">
        {canEdit ? (
          <div
            className="logo-edit-controls"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <EditableText
              value={headerTitle}
              onSave={(v) => saveBranding({ header_title: v })}
              tag="span"
              className="logo-title"
            />
            <EditableText
              value={headerSubtitle}
              onSave={(v) => saveBranding({ header_subtitle: v })}
              tag="span"
              className="logo-subtitle"
            />
          </div>
        ) : (
          <>
            <span className="logo-title">{headerTitle}</span>
            <span className="logo-subtitle">{headerSubtitle}</span>
          </>
        )}
      </div>
    </>
  );

  return (
    <header className={`header menu-v${menuVariant}`}>
      <div className="header-content">
        {canEdit ? (
          <div className="logo" tabIndex={-1}>
            {logoContent}
          </div>
        ) : (
          <Link to="/" className="logo" tabIndex={-1}>
            {logoContent}
          </Link>
        )}

        {canEdit && (
          <VariantCycler
            current={menuVariant}
            total={MENU_VARIANTS}
            onCycle={(v) => saveBranding({ menu_variant: v })}
            label="Menu"
          />
        )}

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
                <NotificationBell />
                <Link
                  to="/inbox"
                  className="header-inbox-btn"
                  title="Messages"
                  onClick={() => setMenuOpen(false)}
                >
                  <Mail size={20} />
                  {inboxUnread > 0 && (
                    <span className="header-inbox-badge">
                      {inboxUnread > 99 ? "99+" : inboxUnread}
                    </span>
                  )}
                </Link>
                <UserLink
                  userId={user.id}
                  username={user.username}
                  displayName={user.display_name}
                  variant="subtle"
                  className="user-link-header"
                />
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

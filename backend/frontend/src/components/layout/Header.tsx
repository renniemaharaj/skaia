import {
  ShoppingCart,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
  Mail,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAtomValue, useSetAtom } from "jotai";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import {
  isAuthenticatedAtom,
  currentUserAtom,
  accessTokenAtom,
  refreshTokenAtom,
  hasPermissionAtom,
} from "../../atoms/auth";
import { inboxUnreadCountAtom } from "../../atoms/inbox";
import { brandingAtom, featuresAtom } from "../../atoms/config";
import { apiRequest } from "../../utils/api";
import { EditableText, ImagePickerButton } from "../landing/EditControls";
import UserLink from "../user/UserLink";
import NotificationBell from "../notifications/NotificationBell";
import "./Header.css";
import { useThemeContext } from "../../hooks/theme/useThemeContext";
import { toast } from "sonner";
import {
  isSoundEnabled,
  setSoundEnabled,
  getSoundVolume,
  setSoundVolume,
} from "../../utils/sound";
import type { Branding } from "../landing/types";

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
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [volume, setVolume] = useState(() => getSoundVolume());
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close volume slider on outside click
  useEffect(() => {
    if (!volumeOpen) return;
    const handler = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setVolumeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [volumeOpen]);

  // Use Jotai atoms for auth state
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(currentUserAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const inboxUnread = useAtomValue(inboxUnreadCountAtom);

  // Branding + edit permission
  const hasPermission = useAtomValue(hasPermissionAtom);
  const branding = useAtomValue(brandingAtom);
  const setBranding = useSetAtom(brandingAtom);
  const features = useAtomValue(featuresAtom);
  const [guestSandboxMode] = useGuestSandboxMode();
  const canEdit = hasPermission("home.manage") || guestSandboxMode;

  const routeAllowed = (feature?: string) => {
    if (!feature) return true;
    if (guestSandboxMode && ["store", "forum", "users"].includes(feature)) {
      return true;
    }
    if (!features) return true;
    return !!features[feature];
  };

  const loading = !branding;
  const logoUrl = branding?.logo_url || "/logo.png";
  const headerTitle = branding?.header_title || branding?.site_name || "";
  const headerSubtitle = branding?.header_subtitle || "";

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
      navigate("/");
      setMenuOpen(false);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path ? "active" : "";
  };

  const logoContent = loading ? (
    <>
      <div className="logo-img-wrapper">
        <div className="skeleton logo-img" style={{ width: 40, height: 40 }} />
      </div>
      <div className="logo-info">
        <span
          className="skeleton"
          style={{ width: 120, height: 16, display: "inline-block" }}
        />
        <span
          className="skeleton"
          style={{
            width: 80,
            height: 12,
            display: "inline-block",
            marginTop: 4,
          }}
        />
      </div>
    </>
  ) : (
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
    <header className="header">
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

        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <nav className={`nav ${menuOpen ? "open" : ""}`}>
          <div className="nav-section">
            {routeAllowed("landing") && (
              <Link
                to="/"
                className={isActive("/")}
                onClick={() => setMenuOpen(false)}
              >
                Home
              </Link>
            )}
            {routeAllowed("store") && (
              <Link
                to="/store"
                className={isActive("/store")}
                onClick={() => setMenuOpen(false)}
              >
                Store
              </Link>
            )}
            {routeAllowed("forum") && (
              <Link
                to="/forum"
                className={isActive("/forum")}
                onClick={() => setMenuOpen(false)}
              >
                Forum
              </Link>
            )}
            <Link
              to="/pages"
              className={isActive("/pages")}
              onClick={() => setMenuOpen(false)}
            >
              Pages
            </Link>
            <Link
              to="/datasources"
              className={`header-new-link ${isActive("/datasources")}`}
              onClick={() => setMenuOpen(false)}
            >
              Data Sources
              <span className="header-new-badge">New</span>
            </Link>
            {isAuthenticated && hasPermission("events.view") && (
              <Link
                to="/activity"
                className={isActive("/activity")}
                onClick={() => setMenuOpen(false)}
              >
                Activity
              </Link>
            )}
          </div>

          <div className="user-section">
            <button
              className="theme-toggle"
              onClick={handleSetTheme}
              title="Toggle dark mode"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {routeAllowed("store") && (
              <div
                className="cart-icon"
                onClick={() => handleNavigation("/cart")}
                title="Shopping Cart"
                style={{ cursor: "pointer" }}
              >
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="cart-count">{cartCount}</span>
                )}
              </div>
            )}
            {isAuthenticated && user ? (
              <div className="user-menu">
                <div className="header-volume-wrap" ref={volumeRef}>
                  <button
                    className="header-sound-toggle"
                    title={soundOn ? "Mute sounds" : "Unmute sounds"}
                    onClick={() => {
                      if (soundOn) {
                        setSoundEnabled(false);
                        setSoundOn(false);
                      } else {
                        const restored = volume > 0 ? volume : 0.7;
                        setSoundVolume(restored);
                        setVolume(restored);
                        setSoundOn(true);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setVolumeOpen((v) => !v);
                    }}
                  >
                    {!soundOn || volume === 0 ? (
                      <VolumeX size={20} />
                    ) : volume < 0.33 ? (
                      <Volume size={20} />
                    ) : volume < 0.66 ? (
                      <Volume1 size={20} />
                    ) : (
                      <Volume2 size={20} />
                    )}
                  </button>
                  {volumeOpen && (
                    <div className="header-volume-dropdown">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        className="header-volume-slider"
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          setSoundVolume(v);
                          setSoundOn(v > 0);
                        }}
                      />
                      <span className="header-volume-label">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                <NotificationBell />
                {routeAllowed("inbox") && (
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
                )}
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
                  onClick={() => {
                    navigate("/login", { state: { from: location } });
                    setMenuOpen(false);
                  }}
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

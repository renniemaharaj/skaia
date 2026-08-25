import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  accessTokenAtom,
  currentUserAtom,
  hasPermissionAtom,
  isAuthenticatedAtom,
  refreshTokenAtom,
} from "../../../atoms/auth";
import { brandingAtom, featuresAtom } from "../../../atoms/config";
import { useGuestSandboxMode } from "../../../hooks/useGuestSandboxMode";
import { apiRequest } from "../../../utils/api";
import { GlassMenu } from "../../ui/GlassMenu";
import { MediaPlaceholder } from "../../ui/MediaPlaceholder";
import UserAvatar from "../../user/UserAvatar";
import { EditableText, ImagePickerButton } from "../EditControls";
import "./Header.css";
import { toast } from "sonner";
import { useThemeContext } from "../../../hooks/theme/useThemeContext";
import type { Branding } from "../types";
import { Drawer } from "./Drawer";

interface HeaderProps {
  cartCount: number;
  isDarkMode: boolean;
  onDarkModeToggle: (isDark: boolean) => void;
  layoutMode: "application" | "web";
  onToggleLayoutMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  isDarkMode,
  // onDarkModeToggle,
  layoutMode,
  onToggleLayoutMode,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Use Jotai atoms for auth state
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(currentUserAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);

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
    }
  };

  const navItems = [
    routeAllowed("landing") && { to: "/", label: "Home", icon: "home" },
    routeAllowed("community") && { to: "/community", label: "Community", icon: "community" },
    routeAllowed("status") && { to: "/status", label: "Service status", icon: "status" },
    routeAllowed("store") && { to: "/store", label: "Store", icon: "store" },
    routeAllowed("forum") && { to: "/forum", label: "Forum", icon: "forum" },
    routeAllowed("docs") && { to: "/doc", label: "Documentation", icon: "docs" },
    { to: "/pages", label: "Pages", icon: "pages" },
    isAuthenticated &&
      hasPermission("home.manage") && {
        to: "/form/site/legal",
        label: "Site policies",
        icon: "pages",
      },
    { to: "/kjv", label: "Bible", icon: "bible" },
    routeAllowed("rankings") && {
      to: "/leaderboards",
      label: "Leaderboards",
      icon: "rankings",
    },
    isAuthenticated &&
      routeAllowed("rewards") && {
        to: "/rewards",
        label: "Rewards",
        icon: "rewards",
      },
    isAuthenticated &&
      user && {
        to: `/form/user/${user.id}/identities`,
        label: "Linked identities",
        icon: "identities",
      },
    routeAllowed("community") && {
      to: "/community/proposal",
      label: "Proposals",
      icon: "proposals",
    },
    routeAllowed("community") && {
      to: "/community/showcase",
      label: "Showcases",
      icon: "showcases",
    },
    routeAllowed("community") && {
      to: "/community/event",
      label: "Events",
      icon: "events",
    },
    isAuthenticated && routeAllowed("users") && { to: "/users", label: "People", icon: "users" },
    isAuthenticated &&
      hasPermission("events.view") && {
        to: "/activity",
        label: "Activity",
        icon: "activity",
      },
  ].filter((item): item is { to: string; label: string; icon: string } => !!item);

  const logoContent = loading ? (
    <>
      <div className="logo-img-wrapper">
        <div className="skeleton logo-img" style={{ width: 40, height: 40 }} />
      </div>
      <div className="logo-info">
        <span className="skeleton" style={{ width: 120, height: 16, display: "inline-block" }} />
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
        <MediaPlaceholder
          alt={headerTitle}
          className="logo-img"
          fit="contain"
          href={logoUrl}
          layout="thumbnail"
          mediaType="image"
          preserveFrame
          showCaption={false}
          size={{ height: 40, width: 40 }}
        />
        {canEdit && (
          <div
            className="logo-edit-controls"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <ImagePickerButton
              onUploaded={url => saveBranding({ logo_url: url })}
              className="logo-img-edit"
            />
          </div>
        )}
      </div>
      <div className="logo-info">
        {canEdit ? (
          <div
            className="logo-edit-controls"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <EditableText
              value={headerTitle}
              onSave={v => saveBranding({ header_title: v })}
              tag="span"
              className="logo-title"
            />
            <EditableText
              value={headerSubtitle}
              onSave={v => saveBranding({ header_subtitle: v })}
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
    <header className="skaia-header">
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

        <nav className="nav">
          <div className="user-section">
            <Drawer
              navigationItems={navItems}
              cartCount={cartCount}
              isDarkMode={isDarkMode}
              layoutMode={layoutMode}
              isAuthenticated={isAuthenticated}
              user={user}
              storeEnabled={routeAllowed("store")}
              inboxEnabled={routeAllowed("inbox")}
              canCustomize={canEdit && !!branding}
              branding={branding}
              onSetTheme={handleSetTheme}
              onToggleLayoutMode={onToggleLayoutMode}
              onNavigate={handleNavigation}
              onSaveBranding={saveBranding}
            />
            {isAuthenticated && user ? (
              <HeaderUserMenu user={user} handleLogout={handleLogout} />
            ) : (
              <div className="auth-buttons">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    navigate("/login", { state: { from: location } });
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

// HeaderUserMenu
function HeaderUserMenu({
  user,
  handleLogout,
}: {
  user: { id: string; username: string; display_name?: string; avatar_url?: string };
  handleLogout: () => void;
}) {
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const toggleAccountMenu = () => {
    if (menuPosition) {
      setMenuPosition(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ x: rect.right - 200, y: rect.bottom + 8 });
  };

  return (
    <div className={`user-menu${menuPosition ? " user-menu--open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu__trigger"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={!!menuPosition}
        onClick={toggleAccountMenu}
      >
        <span className="user-menu__avatar-shell">
          <UserAvatar src={user.avatar_url} alt="" size={26} />
        </span>
        <span className="user-menu__name">{user.display_name || user.username}</span>
        <ChevronDown className="user-menu__chevron" size={15} />
      </button>
      {menuPosition && (
        <GlassMenu
          x={menuPosition.x}
          y={menuPosition.y}
          anchorRef={triggerRef}
          onClose={() => setMenuPosition(null)}
          options={[
            {
              title: "Profile",
              icon: <UserRound size={16} />,
              onClick: () => navigate(`/users/${user.id}`),
            },
            {
              title: "Account settings",
              icon: <Settings size={16} />,
              onClick: () => navigate(`/form/user/${user.id}/profile`),
            },
            {
              title: "Sign out",
              icon: <LogOut size={16} />,
              onClick: handleLogout,
            },
          ]}
        />
      )}
    </div>
  );
}

import { type ReactNode } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useState, useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import {
  accessTokenAtom,
  refreshTokenAtom,
  currentUserAtom,
  isAuthenticatedAtom,
  type User,
} from "../atoms/auth";
import { pendingTpRouteAtom } from "../atoms/presence";
import { apiRequest } from "../utils/api";
import "./Layout.css";
import { useTransitionNavigation } from "../hooks/useTransitionNavigation";
import { usePresence } from "../hooks/usePresence";
import { useWebSocketSync } from "../hooks/useWebSocketSync";
import PresencePanel from "../components/PresencePanel";
import { Toaster, toast } from "sonner";

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    return false;
  });

  usePresence();
  const { subscribe } = useWebSocketSync();
  const { getTotalItems } = useCart();
  const navigate = useNavigate();
  const pendingTpRoute = useAtomValue(pendingTpRouteAtom);
  const clearTpRoute = useSetAtom(pendingTpRouteAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const setIsAuthenticated = useSetAtom(isAuthenticatedAtom);

  const { path, isPending } = useTransitionNavigation();
  // Set theme on mount
  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }, [isDarkMode]);

  // Validate session on mount - clear stale tokens if session is invalid
  useEffect(() => {
    // Read directly from localStorage to avoid stale Jotai atom hydration
    const token = localStorage.getItem("auth.accessToken");
    if (!token) return; // No token, nothing to validate

    const validateSession = async () => {
      try {
        // Fetch user profile — refreshes currentUserAtom with latest DB data
        // (picks up any permission/role/suspension changes made since last login)
        const profile = await apiRequest<User>("/users/profile", {
          method: "GET",
        });
        if (profile) {
          setCurrentUser(profile);
          setIsAuthenticated(true);
          // Subscribe to own user channel via the shared WS so real-time
          // session updates (permissions, roles, suspension) arrive.
          const id = Number(profile.id);
          if (id) subscribe("user", id);
        }
      } catch {
        // Any error (401 from apiRequest already cleared localStorage; handle atom state here)
        setAccessToken(null);
        setRefreshToken(null);
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
    };

    validateSession();
  }, [subscribe]); // Re-run if subscribe identity changes (i.e. after socket reconnect)

  // Listen for unauthorized (401) errors and logout
  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      console.warn(
        "Unauthorized access detected, clearing auth state",
        (event as CustomEvent).detail,
      );
      setAccessToken(null);
      setRefreshToken(null);
      setCurrentUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [setAccessToken, setRefreshToken, setCurrentUser, setIsAuthenticated]);

  useEffect(() => {
    if (!isPending) {
      document.documentElement.scrollTo(0, 0);
    }
  }, [isPending, path]);

  // Consume pending teleport route set by an incoming "tp" WS message.
  useEffect(() => {
    if (pendingTpRoute) {
      toast("You are being teleported", {
        description: `Heading to ${pendingTpRoute}`,
        duration: 4000,
        icon: "⚡",
      });
      navigate(pendingTpRoute);
      clearTpRoute(null);
    }
  }, [pendingTpRoute, navigate, clearTpRoute]);

  return (
    <div className="layout">
      <Header
        cartCount={getTotalItems()}
        isDarkMode={isDarkMode}
        onDarkModeToggle={setIsDarkMode}
      />
      <main className="layout-main">{children}</main>
      <Footer />
      <PresencePanel />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
};

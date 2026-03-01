import { type ReactNode } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useState, useEffect, useRef } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { useCart } from "../context/CartContext";
import {
  accessTokenAtom,
  refreshTokenAtom,
  currentUserAtom,
  isAuthenticatedAtom,
} from "../atoms/auth";
import { apiRequest } from "../utils/api";
import "./Layout.css";
import { useTransitionNavigation } from "../hooks/useTransitionNavigation";

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
  const wsRef = useRef<WebSocket | null>(null);
  const { getTotalItems } = useCart();
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const setIsAuthenticated = useSetAtom(isAuthenticatedAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const { path, isPending } = useTransitionNavigation();
  // Set theme on mount
  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  }, [isDarkMode]);

  // Validate session on mount - clear stale tokens if session is invalid
  useEffect(() => {
    if (!isAuthenticated) return; // Skip if not authenticated

    const validateSession = async () => {
      try {
        // Try to fetch user profile - this will return 401 if token is invalid
        await apiRequest("/users/profile", { method: "GET" });
      } catch (error) {
        // If validation fails, it triggers auth:unauthorized event which clears state
        // No need to do anything here
      }
    };

    validateSession();
  }, []); // Run once on mount

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
        console.log("WebSocket message:", event.data);
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current.onclose = () => {
        console.log("Disconnected from WebSocket");
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!isPending) {
      document.documentElement.scrollTo(0, 0);
    }
  }, [isPending, path]);

  return (
    <div className="layout">
      <Header
        cartCount={getTotalItems()}
        isDarkMode={isDarkMode}
        onDarkModeToggle={setIsDarkMode}
      />
      <main className="layout-main">{children}</main>
      <Footer />
    </div>
  );
};

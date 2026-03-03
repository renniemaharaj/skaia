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
  type User,
} from "../atoms/auth";
import { wsBaseUrlAtom } from "../atoms/config";
import { apiRequest } from "../utils/api";
import "./Layout.css";
import { useTransitionNavigation } from "../hooks/useTransitionNavigation";
import { usePresence } from "../hooks/usePresence";
import PresencePanel from "../components/PresencePanel";

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
  const wsRef = useRef<WebSocket | null>(null);
  const { getTotalItems } = useCart();
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
          // After we know the user's ID, subscribe to their WS channel so
          // real-time session updates (permissions, roles, suspension) arrive.
          const id = Number(profile.id);
          if (id && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "subscribe",
                user_id: id,
                payload: { resource_type: "user", resource_id: id },
              }),
            );
          }
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

  const wsUrl = useAtomValue(wsBaseUrlAtom);

  // Initialize WebSocket connection
  useEffect(() => {
    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("Connected to WebSocket");
        // Subscribe to own user channel for real-time session updates
        const rawUser = localStorage.getItem("auth.user");
        if (rawUser) {
          try {
            const user = JSON.parse(rawUser) as User;
            const id = Number(user?.id);
            if (id) {
              wsRef.current?.send(
                JSON.stringify({
                  type: "subscribe",
                  user_id: id,
                  payload: { resource_type: "user", resource_id: id },
                }),
              );
            }
          } catch {
            // ignore parse errors
          }
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            payload?: {
              action?: string;
              id?: number;
              data?: { user?: User; new_token?: string };
            };
          };

          if (msg.type === "user:update" && msg.payload?.data?.user) {
            const updatedUser = msg.payload.data.user;
            const newToken = msg.payload.data.new_token;

            // Notify components displaying this user's profile (e.g. UserProfile page)
            window.dispatchEvent(
              new CustomEvent("user:profile:updated", {
                detail: { userId: String(updatedUser.id), user: updatedUser },
              }),
            );

            // If this update is for the currently logged-in user, refresh session
            const rawCurrent = localStorage.getItem("auth.user");
            const currentId = rawCurrent
              ? (JSON.parse(rawCurrent) as User)?.id
              : null;
            if (currentId && String(updatedUser.id) === String(currentId)) {
              setCurrentUser(updatedUser);
              if (newToken) {
                setAccessToken(newToken);
              }
              // If the user just got suspended, force logout
              if (updatedUser.is_suspended) {
                setAccessToken(null);
                setRefreshToken(null);
                setCurrentUser(null);
                setIsAuthenticated(false);
              }
            }
          }
        } catch {
          // non-JSON or unexpected shape — ignore
        }
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
      <PresencePanel />
    </div>
  );
};

import { type ReactNode } from "react";
import { Header } from "./page/layout/Header";
import { Footer } from "./page/layout/Footer";
import { Info } from "lucide-react";
import { useState, useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import {
  accessTokenAtom,
  refreshTokenAtom,
  currentUserAtom,
  type User,
} from "../atoms/auth";
import { featuresAtom } from "../atoms/config";
import { pendingTpRouteAtom } from "../atoms/presence";
import { cartItemCountAtom } from "../atoms/store";
import { apiRequest } from "../utils/api";
import "./Layout.css";
import { useTransitionNavigation } from "../hooks/useTransitionNavigation";
import { usePresence } from "../hooks/usePresence";
import { useCursorTracking } from "../hooks/useCursorTracking";
import { useWebSocketSync } from "../hooks/useWebSocketSync";
import { useGuestSandboxMode } from "../hooks/useGuestSandboxMode";
import PresencePanel from "./page/layout/PresencePanel";
import CursorOverlay from "./page/layout/CursorOverlay";
import { Toaster, toast } from "sonner";
import { syncServerTime } from "../utils/serverTime";
import RateLimitedPage from "./RateLimitedPage";

interface LayoutProps {
  children: ReactNode;
}

const RATE_LIMIT_KEY = "pb_rate_limit_until";

function getStoredRateLimitUntil(): number | undefined {
  try {
    const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return undefined;
    const until = parseInt(stored, 10);
    if (Number.isNaN(until) || until <= Date.now()) {
      sessionStorage.removeItem(RATE_LIMIT_KEY);
      return undefined;
    }
    return until;
  } catch {
    return undefined;
  }
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    return false;
  });

  // Sync client clock against the server once so relative-time calculations
  // ("5m ago") are anchored to the authoritative UTC backend clock rather than
  // the potentially drifted client system clock.
  useEffect(() => {
    syncServerTime();
  }, []);

  const features = useAtomValue(featuresAtom);
  const [guestSandboxMode] = useGuestSandboxMode();

  const [holdingSeconds, setHoldingSeconds] = useState<number | undefined>(
    () => {
      const until = getStoredRateLimitUntil();
      return until ? Math.ceil((until - Date.now()) / 1000) : undefined;
    },
  );

  useEffect(() => {
    const handleRateLimit = (event: Event) => {
      const detail = (event as CustomEvent<{ retryAfter?: number }>).detail;
      const seconds = detail.retryAfter ?? 60;
      setHoldingSeconds((current) => {
        const next =
          current === undefined ? seconds : Math.max(current, seconds);
        try {
          sessionStorage.setItem(
            RATE_LIMIT_KEY,
            String(Date.now() + next * 1000),
          );
        } catch {
          /* ignore */
        }
        return next;
      });
    };

    window.addEventListener("api:rate-limit", handleRateLimit);
    return () => window.removeEventListener("api:rate-limit", handleRateLimit);
  }, []);

  useEffect(() => {
    if (holdingSeconds === undefined) return;
    const interval = window.setInterval(() => {
      setHoldingSeconds((seconds) => {
        if (seconds === undefined || seconds <= 1) {
          try {
            sessionStorage.removeItem(RATE_LIMIT_KEY);
          } catch {
            /* ignore */
          }
          return undefined;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [holdingSeconds]);

  usePresence(features?.presence ?? true);
  useCursorTracking();
  const { subscribe } = useWebSocketSync();
  const cartCount = useAtomValue(cartItemCountAtom);
  const navigate = useNavigate();
  const pendingTpRoute = useAtomValue(pendingTpRouteAtom);
  const clearTpRoute = useSetAtom(pendingTpRouteAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);

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
        // Refresh the access token first so it carries up-to-date DB permissions.
        // This is critical: after an admin grants/revokes permissions the old JWT
        // still lacks those claims, so API calls would fail with 403 even though
        // the currentUserAtom shows the correct permissions.
        const storedRefreshToken = localStorage.getItem("auth.refreshToken");
        if (storedRefreshToken) {
          try {
            const refreshResp = await apiRequest<{ access_token: string }>(
              "/auth/refresh",
              {
                method: "POST",
                body: JSON.stringify({ refresh_token: storedRefreshToken }),
              },
            );
            if (refreshResp?.access_token) {
              setAccessToken(refreshResp.access_token);
            }
          } catch {
            // Refresh token expired/invalid — profile fetch below will 401 and clear state.
          }
        }

        // Fetch user profile — refreshes currentUserAtom with latest DB data
        // (picks up any permission/role/suspension changes made since last login)
        const profile = await apiRequest<User>("/users/profile", {
          method: "GET",
        });
        if (profile) {
          setCurrentUser(profile);
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
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [setAccessToken, setRefreshToken, setCurrentUser]);

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

  if (holdingSeconds !== undefined) {
    return <RateLimitedPage retrySeconds={holdingSeconds} />;
  }

  return (
    <div className="layout">
      {guestSandboxMode && (
        <div className="layout-guest-sandbox-banner">
          <Info size={16} className="layout-guest-sandbox-icon" />
          <span>
            Site is in guest sandbox mode for you, most things will fail, but
            you can still explore the page editor.
          </span>
        </div>
      )}
      <Header
        cartCount={cartCount}
        isDarkMode={isDarkMode}
        onDarkModeToggle={setIsDarkMode}
      />
      <main className="layout-main">{children}</main>
      <Footer />
      {(features?.presence ?? true) ? <PresencePanel /> : null}
      <CursorOverlay />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
};

import { type ReactNode } from "react";
import { Header } from "./page/layout/Header";
import { Footer } from "./page/layout/Footer";
import { Info } from "lucide-react";
import { useState, useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { layoutModeAtom } from "../atoms/layoutMode";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import {
  accessTokenAtom,
  refreshTokenAtom,
  currentUserAtom,
  type User,
} from "../atoms/auth";
import { featuresAtom, seoAtom } from "../atoms/config";
import { pendingTpRouteAtom } from "../atoms/presence";
import { cartItemCountAtom } from "../atoms/store";
import { contextUserAtom } from "../atoms/contextUser";
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
import { PromptContainer } from "../components/ui/Prompt";
import { syncServerTime } from "../utils/serverTime";
import Particles from "../components/ui/Particles/Particles";
import RateLimitedPage from "./RateLimitedPage";
import MFAChallenge from "./MFAChallenge";
import type { Role } from "./users/types";

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
  const [layoutMode, setLayoutMode] = useAtom(layoutModeAtom);

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

  const [mfaRequired, setMfaRequired] = useState(false);

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

  useEffect(() => {
    const handleMfaRequired = () => {
      setMfaRequired(true);
    };
    window.addEventListener("auth:mfa-required", handleMfaRequired);
    return () =>
      window.removeEventListener("auth:mfa-required", handleMfaRequired);
  }, []);

  usePresence(features?.presence ?? true);
  useCursorTracking();
  const { subscribe } = useWebSocketSync();
  const cartCount = useAtomValue(cartItemCountAtom);
  const navigate = useNavigate();
  const pendingTpRoute = useAtomValue(pendingTpRouteAtom);
  const clearTpRoute = useSetAtom(pendingTpRouteAtom);
  const seo = useAtomValue(seoAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const contextUser = useAtomValue(contextUserAtom);

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
          // Also subscribe to the user's inbox so message and conversation
          // updates arrive even before the inbox page is opened.
          const id = Number(profile.id);
          if (id) {
            subscribe("user", id);
            subscribe("inbox", id);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage === "MFA Required") {
          setMfaRequired(true);
          return;
        }
        const shouldLogout = /invalid session|session expired|invalid token|token parsing|missing or malformed jwt|unauthorized/i.test(errorMessage);
        if (shouldLogout) {
          // Only clear state if it's explicitly an auth failure, not a 500 or timeout
          setAccessToken(null);
          setRefreshToken(null);
          setCurrentUser(null);
        }
      }
    };

    validateSession();
  }, [subscribe]); // Re-run if subscribe identity changes (i.e. after socket reconnect)

  // Listen for unauthorized (401) errors and logout
  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ errorMessage?: string }>).detail;
      if (detail?.errorMessage === "MFA Required") {
        setMfaRequired(true);
        return;
      }
      console.warn(
        "Unauthorized access detected, clearing auth state",
        detail,
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

  const [allRoles, setAllRoles] = useState<Role[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    apiRequest<Role[]>("/users/roles")
      .then((roles) => {
        if (roles) setAllRoles(roles);
      })
      .catch(console.error);
  }, [currentUser?.id]);

  const userRoles = currentUser?.roles ?? [];
  const rolesWithDetails = allRoles
    .filter((r) => userRoles.includes(r.name))
    .sort((a, b) => b.power_level - a.power_level);
  const topRole = rolesWithDetails[0];
  const themeColor = topRole?.theme_color;

  if (holdingSeconds !== undefined) {
    return <RateLimitedPage retrySeconds={holdingSeconds} />;
  }

  if (mfaRequired) {
    return (
      <MFAChallenge
        totpToken=""
        onAuthSuccess={() => setMfaRequired(false)}
        onBack={() => {
          setAccessToken(null);
          setRefreshToken(null);
          setCurrentUser(null);
          setMfaRequired(false);
          navigate("/login");
        }}
      />
    );
  }

  return (
    <div
      className={`layout${layoutMode === "application" ? " layout--application" : ""}`}
    >
      {currentUser?.font_family && (
        <style>{`
          :root {
            --font-sans: ${currentUser.font_family}, "Inter", "Outfit", "Roboto", system-ui, -apple-system, sans-serif !important;
          }
        `}</style>
      )}
      {themeColor && (
        <style>{`
          :root {
            --primary-color: ${themeColor} !important;
            --primary-light: ${themeColor} !important;
            --primary-dark: ${themeColor} !important;
          }
        `}</style>
      )}
      {(() => {
        const hasContextMedia = contextUser && (contextUser.background_image_url || contextUser.background_video_url);
        const effectiveBgImage = contextUser?.background_image_url || (!hasContextMedia ? seo?.dom_skin : null);
        const effectiveBgVideo = contextUser?.background_video_url || (!hasContextMedia ? seo?.dom_video : null);
        const effectiveBgPos = contextUser?.background_position || "center";

        return (
          <>
            {effectiveBgImage && (
              <style>{`
                body {
                  background-image: url("${effectiveBgImage}") !important;
                  background-size: ${contextUser?.background_image_url ? "cover" : "auto"} !important;
                  background-position: ${effectiveBgPos} !important;
                  background-attachment: fixed !important;
                  ${!contextUser?.background_image_url ? "background-repeat: repeat;" : ""}
                }
                .layout-main, .up-container, .card, .panel, .forum-container {
                   background-color: rgba(var(--bg-color-rgb), 0.85);
                   backdrop-filter: blur(10px);
                }
                :root {
                   background-image: url("${effectiveBgImage}");
                   background-repeat: ${!contextUser?.background_image_url ? "repeat" : "no-repeat"};
                   background-size: ${contextUser?.background_image_url ? "cover" : "auto"};
                   background-attachment: fixed;
                   background-position: ${effectiveBgPos};
                }
              `}</style>
            )}
            {effectiveBgVideo && (
              <video
                src={effectiveBgVideo}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: "100vh",
                  objectFit: "cover",
                  zIndex: -1,
                  pointerEvents: "none"
                }}
              />
            )}
            {(effectiveBgVideo || effectiveBgImage) && (
              <style>{`
                #root, .app, .main-content, .layout {
                   background: transparent !important;
                }
                html, body {
                   background-color: transparent !important;
                }
              `}</style>
            )}
          </>
        );
      })()}
      {guestSandboxMode && (
        <div className="layout-guest-sandbox-banner">
          <Info size={16} className="layout-guest-sandbox-icon" />
          <span>
            Site is in guest sandbox mode for you, most things will fail, but
            you can still explore the page editor.
          </span>
        </div>
      )}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -2, pointerEvents: 'none' }}>
        <Particles
          particleColors={isDarkMode ? ['#ffffff', '#ffffff'] : ['#000000', '#000000']}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          moveParticlesOnHover={true}
          particleHoverFactor={1}
          alphaParticles={true}
          particleBaseSize={100}
          sizeRandomness={1}
          cameraDistance={20}
          disableRotation={false}
        />
      </div>
      <Header
        cartCount={cartCount}
        isDarkMode={isDarkMode}
        onDarkModeToggle={setIsDarkMode}
        layoutMode={layoutMode as "application" | "web"}
        onToggleLayoutMode={() =>
          setLayoutMode(layoutMode === "application" ? "web" : "application")
        }
      />
      <main className="layout-main">{children}</main>
      {layoutMode === "web" && <Footer />}
      {(features?.presence ?? true) ? <PresencePanel /> : null}
      <CursorOverlay />
      <Toaster position="bottom-right" richColors closeButton theme={isDarkMode ? "dark" : "light"} />
      <PromptContainer />
    </div>
  );
};

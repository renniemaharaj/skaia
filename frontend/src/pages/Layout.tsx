import { useAtomValue, useSetAtom, getDefaultStore } from "jotai";
import { useAtom } from "jotai";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";
import { type User, accessTokenAtom, currentUserAtom, refreshTokenAtom } from "../atoms/auth";
import { featuresAtom, seoAtom } from "../atoms/config";
import { contextUserAtom } from "../atoms/contextUser";
import { layoutModeAtom } from "../atoms/layoutMode";
import {
  pendingTpRouteAtom,
  pendingTpUserAtom,
  cursorPositionsAtom,
  layoutChildrenAtom,
  presencePanelExpandedAtom,
} from "../atoms/presence";
import { enlargedStreamIdAtom } from "../atoms/voice";
import { cartItemCountAtom } from "../atoms/store";
import { Footer } from "../components/page/layout/Footer";
import { Header } from "../components/page/layout/Header";
import { type MFAChallengeContext, type RateLimitDefconInfo, apiRequest } from "../utils/api";
import "./Layout.css";
import { Toaster, toast } from "sonner";
import { physicsSettingsAtom } from "../atoms/physics";
import CursorOverlay from "../components/page/layout/CursorOverlay";
import { PromptContainer } from "../components/ui/Prompt";
import type { Role } from "../components/user/types";
import { useThemeContext } from "../hooks/theme/useThemeContext";
import { useCursorTracking } from "../hooks/useCursorTracking";
import { useGuestSandboxMode } from "../hooks/useGuestSandboxMode";
import { usePresence } from "../hooks/usePresence";
import { useTransitionNavigation } from "../hooks/useTransitionNavigation";
import { useWebSocketSync } from "../hooks/useWebSocketSync";
import { syncServerTime } from "../utils/serverTime";
import MFAChallenge from "./MFAChallenge";
import RateLimitedPage from "./RateLimitedPage";

// Heavy ambient/overlay widgets — lazy-loaded so they never block the
// critical paint path.  Null fallbacks are intentional: these are decorative
// overlays and showing a spinner in their place would be jarring.
const PresencePanel = lazy(() => import("../components/page/layout/PresencePanel"));
const GlobalUploader = lazy(() => import("../components/ui/GlobalUploader"));
const GravityParticles = lazy(() => import("../components/ui/GravityParticles"));
const CenterAnchoredSystem = lazy(() =>
  import("../components/ui/GravityParticles/GravityRenderers").then(m => ({
    default: m.CenterAnchoredSystem,
  }))
);
const TextGravityRenderer = lazy(() =>
  import("../components/ui/GravityParticles/GravityRenderers").then(m => ({
    default: m.TextGravityRenderer,
  }))
);
const Particles = lazy(() => import("../components/ui/Particles/Particles"));

/**
 * Isolated wrapper that subscribes to cursorPositionsAtom so that cursor
 * updates only re-render this small component, not the entire Layout tree.
 */
const GravityParticlesWithCursors = ({
  particleCount,
  physicsSettings,
}: { particleCount: number; physicsSettings: { rendererType: string; rendererText: string } }) => {
  const cursorPositions = useAtomValue(cursorPositionsAtom);
  const externalCursors = useMemo(() => {
    return Array.from(cursorPositions.values()).map(c => ({
      x: c.x * (typeof window !== "undefined" ? window.innerWidth : 1920),
      y: c.y * (typeof window !== "undefined" ? window.innerHeight : 1080),
    }));
  }, [cursorPositions]);

  if (physicsSettings.rendererType === "center-anchored") {
    return <CenterAnchoredSystem particleCount={particleCount} />;
  }
  if (physicsSettings.rendererType === "text") {
    return (
      <TextGravityRenderer
        text={physicsSettings.rendererText}
        particleCount={particleCount + 150}
      />
    );
  }
  return <GravityParticles particleCount={particleCount} externalCursors={externalCursors} />;
};

interface LayoutProps {
  children: ReactNode;
}

const RATE_LIMIT_KEY = "pb_rate_limit_until";

function getStoredRateLimitUntil(): number | undefined {
  try {
    const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return undefined;
    const until = Number.parseInt(stored, 10);
    if (Number.isNaN(until) || until <= Date.now()) {
      sessionStorage.removeItem(RATE_LIMIT_KEY);
      return undefined;
    }
    return until;
  } catch {
    return undefined;
  }
}

const RATE_LIMIT_CHALLENGE_KEY = "pb_rate_limit_challenge";
function getStoredRateLimitChallenge(): string | undefined {
  try {
    return sessionStorage.getItem(RATE_LIMIT_CHALLENGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

const RATE_LIMIT_DEFCON_KEY = "pb_rate_limit_defcon";
function getStoredRateLimitDefcon(): RateLimitDefconInfo | undefined {
  try {
    const data = sessionStorage.getItem(RATE_LIMIT_DEFCON_KEY);
    return data ? JSON.parse(data) : undefined;
  } catch {
    return undefined;
  }
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { theme, specifyTheme } = useThemeContext();
  const isDarkMode = theme === "dark";
  const [layoutMode, setLayoutMode] = useAtom(layoutModeAtom);

  // Sync client clock against the server once so relative-time calculations
  // ("5m ago") are anchored to the authoritative UTC backend clock rather than
  // the potentially drifted client system clock.
  useEffect(() => {
    syncServerTime();
  }, []);

  const features = useAtomValue(featuresAtom);
  const [guestSandboxMode] = useGuestSandboxMode();

  const [holdingSeconds, setHoldingSeconds] = useState<number | undefined>(() => {
    const until = getStoredRateLimitUntil();
    return until ? Math.ceil((until - Date.now()) / 1000) : undefined;
  });

  const [rateLimitChallenge, setRateLimitChallenge] = useState<string | undefined>(
    getStoredRateLimitChallenge()
  );
  const [rateLimitDefcon, setRateLimitDefcon] = useState<RateLimitDefconInfo | undefined>(
    getStoredRateLimitDefcon()
  );
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaContext, setMfaContext] = useState<MFAChallengeContext>({});

  useEffect(() => {
    const handleRateLimit = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          retryAfter?: number;
          challenge?: string;
          defconInfo?: RateLimitDefconInfo;
        }>
      ).detail;
      const seconds = detail.retryAfter ?? 60;

      setRateLimitChallenge(detail.challenge);
      setRateLimitDefcon(detail.defconInfo);
      if (detail.challenge) {
        try {
          sessionStorage.setItem(RATE_LIMIT_CHALLENGE_KEY, detail.challenge);
        } catch {}
      } else {
        try {
          sessionStorage.removeItem(RATE_LIMIT_CHALLENGE_KEY);
        } catch {}
      }
      if (detail.defconInfo) {
        try {
          sessionStorage.setItem(RATE_LIMIT_DEFCON_KEY, JSON.stringify(detail.defconInfo));
        } catch {}
      } else {
        try {
          sessionStorage.removeItem(RATE_LIMIT_DEFCON_KEY);
        } catch {}
      }

      setHoldingSeconds(current => {
        const next = current === undefined ? seconds : Math.max(current, seconds);
        try {
          sessionStorage.setItem(RATE_LIMIT_KEY, String(Date.now() + next * 1000));
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
      setHoldingSeconds(seconds => {
        if (seconds === undefined || seconds <= 1) {
          try {
            sessionStorage.removeItem(RATE_LIMIT_KEY);
            sessionStorage.removeItem(RATE_LIMIT_CHALLENGE_KEY);
            sessionStorage.removeItem(RATE_LIMIT_DEFCON_KEY);
          } catch {
            /* ignore */
          }
          setRateLimitChallenge(undefined);
          setRateLimitDefcon(undefined);
          return undefined;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [holdingSeconds]);

  useEffect(() => {
    const handleMfaRequired = (event: Event) => {
      const detail = (event as CustomEvent<MFAChallengeContext>).detail;
      setMfaContext(detail ?? {});
      setMfaRequired(true);
    };
    window.addEventListener("auth:mfa-required", handleMfaRequired);
    return () => window.removeEventListener("auth:mfa-required", handleMfaRequired);
  }, []);

  usePresence(features?.presence ?? true);
  useCursorTracking();
  const { subscribe } = useWebSocketSync();
  const cartCount = useAtomValue(cartItemCountAtom);
  const navigate = useNavigate();
  const pendingTpRoute = useAtomValue(pendingTpRouteAtom);
  const clearTpRoute = useSetAtom(pendingTpRouteAtom);
  const pendingTpUser = useAtomValue(pendingTpUserAtom);
  const clearTpUser = useSetAtom(pendingTpUserAtom);

  const setLayoutChildren = useSetAtom(layoutChildrenAtom);
  const expanded = useAtomValue(presencePanelExpandedAtom);
  const enlargedStreamId = useAtomValue(enlargedStreamIdAtom);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 720;
  const isPresenceSplitMode = expanded && !isMobile && !enlargedStreamId;

  useEffect(() => {
    setLayoutChildren(children);
  }, [children, setLayoutChildren]);

  const seo = useAtomValue(seoAtom);
  const physicsSettings = useAtomValue(physicsSettingsAtom);
  const setAccessToken = useSetAtom(accessTokenAtom);
  const setRefreshToken = useSetAtom(refreshTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const contextUser = useAtomValue(contextUserAtom);

  const { isPending } = useTransitionNavigation();

  // Validate session on mount - clear stale tokens if session is invalid
  useEffect(() => {
    // Read directly from localStorage to avoid stale Jotai atom hydration
    let token = localStorage.getItem("auth.accessToken");
    if (token?.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);
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
            const refreshResp = await apiRequest<{ access_token: string }>("/auth/refresh", {
              method: "POST",
              body: JSON.stringify({ refresh_token: storedRefreshToken }),
            });
            if (refreshResp?.access_token) {
              setAccessToken(refreshResp.access_token);
            }
          } catch {
            // Refresh token expired/invalid - profile fetch below will 401 and clear state.
          }
        }

        // Fetch user profile - refreshes currentUserAtom with latest DB data
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
        const shouldLogout =
          /invalid session|session expired|invalid token|token parsing|missing or malformed jwt|unauthorized/i.test(
            errorMessage
          );
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
      const shouldLogout =
        !detail?.errorMessage ||
        /invalid session|session expired|invalid token|token parsing|missing or malformed jwt|unauthorized/i.test(
          detail.errorMessage
        );
      if (!shouldLogout) return;
      console.warn("Unauthorized access detected, clearing auth state", detail);
      setAccessToken(null);
      setRefreshToken(null);
      setCurrentUser(null);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [setAccessToken, setRefreshToken, setCurrentUser]);

  const location = useLocation();
  const isAppModeRoute = (pathname: string) => {
    if (pathname.startsWith("/inbox")) return true;
    if (pathname === "/users") return true;
    if (pathname.startsWith("/activity")) return true;
    if (pathname.startsWith("/deployments")) return true;
    if (pathname.startsWith("/datasources")) return true;
    if (pathname.startsWith("/settings")) return true;
    if (pathname.startsWith("/admin")) return true;
    if (pathname.startsWith("/tmp/")) return true;
    if (pathname.startsWith("/flow")) return true;
    if (pathname.startsWith("/stream/")) return true;
    return false;
  };
  const effectiveLayoutMode = isAppModeRoute(location.pathname) ? "application" : layoutMode;

  // Normal navigation and hash scrolling
  // Normal navigation and hash scrolling
  useEffect(() => {
    if (!isPending) {
      if (location.hash) {
        setTimeout(() => {
          const id = location.hash.replace("#", "");
          const element = document.getElementById(id);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            const root = document.getElementById("root");
            if (root) root.scrollTo({ top: 0, left: 0, behavior: "instant" });
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          }
        }, 100);
      } else {
        setTimeout(() => {
          const root = document.getElementById("root");
          if (root) {
            root.style.scrollBehavior = "auto";
            root.scrollTo({ top: 0, left: 0, behavior: "instant" });
            root.scrollTop = 0;
            setTimeout(() => {
              root.style.scrollBehavior = "";
            }, 10);
          }

          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          setTimeout(() => {
            document.documentElement.style.scrollBehavior = "";
          }, 10);
        }, 10);
      }
    }
  }, [location.pathname, location.hash, isPending]);

  // Teleport to user logic — reads cursor positions lazily from the Jotai store
  // rather than subscribing to the atom (avoids Layout re-renders on cursor ticks).
  useEffect(() => {
    if (!isPending && pendingTpUser) {
      setTimeout(() => {
        const cursorPositions = getDefaultStore().get(cursorPositionsAtom);
        const targetCursor = cursorPositions.get(pendingTpUser);
        if (targetCursor) {
          const root = document.getElementById("root");
          const target = root || window;
          const scrollContainer = root || document.documentElement;

          target.scrollTo({
            left: targetCursor.x * scrollContainer.scrollWidth - window.innerWidth / 2,
            top: targetCursor.y * scrollContainer.scrollHeight - window.innerHeight / 2,
            behavior: "smooth",
          });
        }
        clearTpUser(null);
      }, 300);
    }
  }, [pendingTpUser, isPending, clearTpUser]);

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
      .then(roles => {
        if (roles) setAllRoles(roles);
      })
      .catch(console.error);
  }, [currentUser?.id]);

  const userRoles = currentUser?.roles ?? [];
  const rolesWithDetails = allRoles
    .filter(r => userRoles.includes(r.name))
    .sort((a, b) => b.power_level - a.power_level);
  const topRole = rolesWithDetails[0];
  const themeColor = topRole?.theme_color;

  if (holdingSeconds !== undefined) {
    return (
      <RateLimitedPage
        retrySeconds={holdingSeconds}
        challenge={rateLimitChallenge}
        defconInfo={rateLimitDefcon}
        onCleared={() => {
          setHoldingSeconds(undefined);
          try {
            sessionStorage.removeItem(RATE_LIMIT_KEY);
            sessionStorage.removeItem(RATE_LIMIT_CHALLENGE_KEY);
            sessionStorage.removeItem(RATE_LIMIT_DEFCON_KEY);
          } catch {}
          setRateLimitChallenge(undefined);
          setRateLimitDefcon(undefined);
          window.dispatchEvent(new CustomEvent("api:rate-limit-cleared"));
        }}
      />
    );
  }

  if (mfaRequired) {
    return (
      <MFAChallenge
        totpToken=""
        reasonCode={mfaContext.reasonCode}
        action={mfaContext.action}
        onAuthSuccess={() => {
          setMfaRequired(false);
          setMfaContext({});
        }}
        onBack={() => {
          setAccessToken(null);
          setRefreshToken(null);
          setCurrentUser(null);
          setMfaRequired(false);
          setMfaContext({});
          navigate("/login");
        }}
      />
    );
  }

  return (
    <div
      className={`layout${effectiveLayoutMode === "application" ? " layout--application" : ""}`}
      style={{ isolation: "isolate" }}
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
        const hasContextMedia =
          contextUser && (contextUser.background_image_url || contextUser.background_video_url);
        const effectiveBgImage =
          contextUser?.background_image_url || (!hasContextMedia ? seo?.dom_skin : null);
        const effectiveBgVideo =
          contextUser?.background_video_url || (!hasContextMedia ? seo?.dom_video : null);
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
                .layout-main, .card, .panel {
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
                  zIndex: -2,
                  pointerEvents: "none",
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
            Site is in guest sandbox mode for you, most things will fail, but you can still explore
            the page editor.
          </span>
        </div>
      )}
      {seo?.particle_style === "gravity" && (
        <Suspense fallback={null}>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: -1,
              pointerEvents: "none",
            }}
          >
            <GravityParticlesWithCursors
              particleCount={150}
              physicsSettings={{
                rendererType: physicsSettings.rendererType,
                rendererText: physicsSettings.rendererText,
              }}
            />
          </div>
        </Suspense>
      )}

      {(seo?.particle_style === "default" || !seo?.particle_style) && (
        <Suspense fallback={null}>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: -1,
              pointerEvents: "none",
            }}
          >
            <Particles
              particleColors={isDarkMode ? ["#ffffff", "#ffffff"] : ["#000000", "#000000"]}
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
        </Suspense>
      )}
      <Header
        cartCount={cartCount}
        isDarkMode={isDarkMode}
        onDarkModeToggle={dark => specifyTheme(dark ? "dark" : "light")}
        layoutMode={effectiveLayoutMode as "application" | "web"}
        onToggleLayoutMode={() =>
          setLayoutMode(layoutMode === "application" ? "web" : "application")
        }
      />
      <main className="layout-main">{!isPresenceSplitMode ? children : null}</main>
      {effectiveLayoutMode === "web" && <Footer />}
      {(features?.presence ?? true) ? (
        <Suspense fallback={null}>
          <PresencePanel />
        </Suspense>
      ) : null}
      <CursorOverlay />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        theme={isDarkMode ? "dark" : "light"}
      />
      <Suspense fallback={null}>
        <GlobalUploader />
      </Suspense>
      <PromptContainer />
    </div>
  );
};

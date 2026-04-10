import { Route } from "react-router-dom";
import Suspended from "./suspended";
import { protectedRoutes, publicRoutes, guestRoutes } from "./routes";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { GuestRoute } from "../components/auth/GuestRoute";
import type { JSX } from "react";

export interface Primitve {
  element: JSX.Element;
  suspended?: boolean;
  conditional?: string;
}

export interface CustomRoute extends Primitve {
  path: string;
}

export interface IndexRoute extends Primitve {
  index: true;
}

const passThrough = (route: CustomRoute) =>
  route.suspended ? <Suspended /> : route.element;

const SANDBOX_ENABLED_FEATURES = new Set(["store", "forum", "users"]);

const featureAllowed = (
  conditional: string | undefined,
  features: Record<string, boolean> | null,
  guestSandboxMode = false,
): boolean => {
  if (!conditional) return true;
  if (guestSandboxMode && SANDBOX_ENABLED_FEATURES.has(conditional)) {
    return true;
  }
  if (!features) return true; // fallback while loading
  return !!features[conditional];
};

export const publicRoutesFunc = (
  features: Record<string, boolean> | null,
  guestSandboxMode = false,
) => {
  return publicRoutes
    .filter((route) =>
      featureAllowed(route.conditional, features, guestSandboxMode),
    )
    .map((route, i) =>
      "index" in route ? (
        <Route key={`public-index` + i} index element={route.element} />
      ) : (
        <Route
          key={`public-${route.path}` + i}
          path={route.path}
          element={passThrough(route)}
        />
      ),
    );
};

export const protectedRoutesFunc = (
  features: Record<string, boolean> | null,
  guestSandboxMode = false,
) => {
  return protectedRoutes
    .filter((route) =>
      featureAllowed(route.conditional, features, guestSandboxMode),
    )
    .map((route, i) => (
      <Route
        key={`private-${(route as CustomRoute).path || i}` + i}
        path={(route as CustomRoute).path}
        element={
          <ProtectedRoute>{passThrough(route as CustomRoute)}</ProtectedRoute>
        }
      />
    ));
};

export const guestRoutesFunc = (
  features: Record<string, boolean> | null,
  guestSandboxMode = false,
) => {
  return guestRoutes
    .filter((route) =>
      featureAllowed(route.conditional, features, guestSandboxMode),
    )
    .map((route, i) => (
      <Route
        key={`guest-${(route as CustomRoute).path || i}` + i}
        path={(route as CustomRoute).path}
        element={<GuestRoute>{passThrough(route as CustomRoute)}</GuestRoute>}
      />
    ));
};

const APPLICATION_ROUTE_PREFIXES = [
  "/inbox",
  "/activity",
  "/trash",
  "/deployments",
  "/datasources",
  "/settings",
  "/form/user/",
  "/form/site/",
  "/admin",
  "/tmp/",
  "/flow",
  "/stream/",
  "/clipmaker",
  "/visualizer",
] as const;

/**
 * Route chrome is pathname-owned. Routed components must not mutate the global
 * layout mode on mount because that changes sibling spacing and can leak across
 * navigation. The stored mode remains a user preference for routes not listed
 * here.
 */
export function isApplicationRoute(pathname: string): boolean {
  if (pathname === "/users") return true;
  return APPLICATION_ROUTE_PREFIXES.some(prefix =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

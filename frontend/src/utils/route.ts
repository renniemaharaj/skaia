export function normalizeRoute(route: string | undefined): string {
  if (!route) return "/";
  // Strip query parameters and hash
  let normalized = route.split("?")[0].split("#")[0];
  // Strip trailing slashes, unless it's just "/"
  normalized = normalized.replace(/\/+$/, "");
  return (normalized || "/").toLowerCase();
}

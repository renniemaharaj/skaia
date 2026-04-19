export const CACHE_TTL_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 14400, label: "4 hours" },
  { value: 43200, label: "12 hours" },
  { value: 86400, label: "24 hours" },
] as const;

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export function cacheTTLLabel(ttl: number): string {
  return CACHE_TTL_OPTIONS.find((o) => o.value === ttl)?.label ?? `${ttl}s`;
}

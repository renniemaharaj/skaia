/**
 * Server-synchronised time utilities
 *
 * Problem: relative-time strings ("5m ago") computed with Date.now() are
 * vulnerable to client clock skew — a client whose clock is minutes ahead or
 * behind the server will show nonsense like "in 3 minutes" for very recent
 * messages.  Additionally, JavaScript's `Date` already stores every instant as
 * UTC milliseconds, so timezone does NOT affect absolute comparisons — but
 * presenting local times for display requires the browser's detected locale and
 * timezone to be respected.
 *
 * Solution:
 *  1. On startup call `syncServerTime()` once.  It sends a single GET /time
 *     request, measures the round-trip, and computes:
 *
 *       offsetMs = serverTimeAtMidpoint - clientTimeAtMidpoint
 *
 *  2. `getServerNow()` returns Date.now() + offsetMs — a clock that stays in
 *     sync with the backend's authoritative UTC clock.
 *
 *  3. All relative-time ("5m ago") calculations use getServerNow() instead of
 *     Date.now(), so they are correct even when client and server clocks differ.
 *
 *  4. Absolute time display (`formatLocalTime`, `formatDate`) uses
 *     `Intl.DateTimeFormat` with implicit `undefined` locale + timezone, which
 *     automatically resolves to the user's OS/browser locale and IANA timezone
 *     (e.g. "America/New_York").  This is the production-safe way to localise
 *     times — it handles DST, regional number formats, and 12/24-hour
 *     preferences without any manual config.
 */

/** Offset (ms) between the server's clock and the client's clock. */
let _offsetMs = 0;

/**
 * Synchronise the client clock against the backend.
 * Call exactly once near app start (e.g. in the root Layout component).
 * Safe to call multiple times — subsequent calls recalibrate the offset.
 */
export async function syncServerTime(): Promise<void> {
  try {
    const clientBefore = Date.now();
    const res = await fetch("/time", { method: "GET" });
    const clientAfter = Date.now();
    if (!res.ok) return;
    const data: { now: string } = await res.json();
    if (!data?.now) return;

    const serverMs = new Date(data.now).getTime();
    // Account for round-trip latency by assuming the server responded at the
    // midpoint between our two client timestamps.
    const roundTripMs = clientAfter - clientBefore;
    _offsetMs = serverMs + roundTripMs / 2 - clientAfter;
  } catch {
    // Gracefully degrade to the local clock — offset stays 0.
  }
}

/**
 * Returns the estimated current server time in milliseconds since epoch (UTC).
 * Equivalent to Date.now() but corrected for client clock skew.
 */
export function getServerNow(): number {
  return Date.now() + _offsetMs;
}

/**
 * Returns a short relative-time string ("just now", "5m", "2h", "3d") by
 * comparing the given ISO-8601 UTC timestamp to the server-synced clock.
 *
 * Using the server clock reference means the string is identical for every
 * client regardless of their local system time or timezone offset.
 */
export function relativeTime(iso: string): string {
  const diff = getServerNow() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Same as `relativeTime` but appends " ago" for use in verbose contexts
 * such as notification dropdowns.  "just now" is returned as-is (no "ago").
 */
export function relativeTimeAgo(iso: string): string {
  const r = relativeTime(iso);
  return r === "just now" ? r : `${r} ago`;
}

/**
 * Formats a UTC ISO timestamp as a localised time string (HH:MM) in the
 * user's detected IANA timezone via `Intl.DateTimeFormat`.
 *
 * Passing `undefined` as the locale lets the runtime pick the user's browser
 * locale automatically — the correct production practice for multi-region
 * deployments.  Omitting `timeZone` defaults to the environment timezone
 * (i.e. the OS/browser timezone the user has set).
 */
export function formatLocalTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Formats a UTC ISO timestamp as "HH:MM · Mon D" using the user's locale and
 * timezone.  Suitable for thread/comment timestamps where both time and date
 * context are useful.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
  return `${time} · ${date}`;
}

/**
 * Formats a UTC ISO timestamp as a full datetime string including timezone
 * abbreviation — safe as a hover tooltip so users in unusual timezones always
 * know the exact absolute time being shown.
 */
export function formatFullDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

import type { PageSection } from "./types";

export const sortSections = (secs: PageSection[]) =>
  [...secs].sort((a, b) => a.display_order - b.display_order);

/**
 * JSON.stringify with sorted keys so that key-order differences introduced by
 * PostgreSQL JSONB normalisation don't cause false negatives.
 */
export function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (value as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return value;
  });
}

/**
 * Preserve object references for sections whose content hasn't changed.
 * React skips re-rendering memoised children when their props keep the same
 * reference, so returning the *old* object for unchanged sections means only
 * the actually-modified section triggers a re-render.
 */
export function mergeSections(current: PageSection[], incoming: PageSection[]): PageSection[] {
  if (current.length === 0) return incoming;
  const currentMap = new Map(current.map(s => [s.id, s]));
  let changed = current.length !== incoming.length;
  const merged = incoming.map(inc => {
    const existing = currentMap.get(inc.id);
    if (
      existing &&
      stableStringify({ ...existing, items: existing.items ?? [] }) ===
        stableStringify({ ...inc, items: inc.items ?? [] })
    ) {
      return existing; // same data => keep old reference
    }
    changed = true;
    return inc;
  });
  return changed ? merged : current;
}

export function mutationFailureMessage(error: unknown): string {
  if (error instanceof Error && (error as Error & { status?: number }).status === 409) {
    return "This section changed in another editor. The latest version has been reloaded.";
  }
  return "Failed to save changes - reloading page";
}

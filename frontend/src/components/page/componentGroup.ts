import type { ComponentGroupItem } from "./types";

export function orderedComponentItems(items: ComponentGroupItem[]): ComponentGroupItem[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function moveComponentItem(
  items: ComponentGroupItem[],
  itemId: string,
  direction: "up" | "down"
): ComponentGroupItem[] {
  const ordered = orderedComponentItems(items);
  const sourceIndex = ordered.findIndex(item => item.id === itemId);
  const targetIndex = sourceIndex + (direction === "up" ? -1 : 1);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return ordered;

  [ordered[sourceIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[sourceIndex]];
  return ordered.map((item, index) => ({ ...item, order: index }));
}

export function normalizeComponentWidth(rawValue: string, fallback: number): number {
  if (!rawValue.trim()) return fallback;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(10, Math.min(100, Math.round(parsed)));
}

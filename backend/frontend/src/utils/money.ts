// Utility helpers for normalizing money units (cents <-> dollars)
export const centsToDollars = (cents: number): number => cents / 100;

export const formatCents = (cents: number): string => {
  const dollars = centsToDollars(cents || 0);
  return `$${dollars.toFixed(2)}`;
};

export const parseDollarsToCents = (value: string | number): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
};

export default {
  centsToDollars,
  formatCents,
  parseDollarsToCents,
};

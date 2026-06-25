const CONFIRMED_STATUSES = new Set(["stock", "memo", "hold", "pullback_confirmed"]);
const FACTORY_STATUSES = new Set(["factory_order", "factory_order_placed"]);
const PENDING_STATUSES = new Set([
  "pullback",
  "pullback_available",
  "pb_in_progress",
  "pending_pullback",
]);

export const PULLBACK_SCREEN_STATUSES = [
  "pullback",
  "pullback_available",
  "pb_in_progress",
  "pending_pullback",
] as const;

export const FACTORY_ORDER_STATUSES = ["factory_order", "factory_order_placed"] as const;

export function isConfirmedStatus(status: string): boolean {
  return CONFIRMED_STATUSES.has(status.toLowerCase());
}

export function isFactoryStatus(status: string): boolean {
  return FACTORY_STATUSES.has(status.toLowerCase());
}

export function isPendingStatus(status: string): boolean {
  return PENDING_STATUSES.has(status.toLowerCase());
}

export function classifyItemStatus(status: string): "confirmed" | "factory" | "pending" | "other" {
  const s = status.toLowerCase();
  if (CONFIRMED_STATUSES.has(s)) return "confirmed";
  if (FACTORY_STATUSES.has(s)) return "factory";
  if (PENDING_STATUSES.has(s)) return "pending";
  return "other";
}

export function daysSinceDate(date: Date): number {
  const today = new Date();
  const startToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((startToday - startDate) / 86_400_000);
}

export function userDisplayName(u: {
  FirstName: string;
  LastName: string;
  Email?: string;
}): string {
  const name = `${u.FirstName} ${u.LastName}`.trim();
  return name || u.Email || "—";
}

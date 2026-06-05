import type { DashboardSession } from "@/components/layout/dashboard-session";

/** Client-side check using JWT `permissions[]`. APIs still enforce via `requirePermission`. */
export function sessionHasPermission(
  session: DashboardSession,
  permissionKey: string,
): boolean {
  return Boolean(session?.permissions?.includes(permissionKey));
}

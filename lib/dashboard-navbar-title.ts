/** Left title in the dashboard top bar — matches the current screen. */
export function dashboardNavbarGroupTitle(pathname: string | null): string {
  const p = pathname ?? "";
  if (p.startsWith("/settings/profile")) return "My Profile";
  if (p.startsWith("/settings")) return "System Settings";
  if (p.startsWith("/dashboard")) return "Dashboard";
  if (p.startsWith("/admin/users")) return "User Management";
  if (p.startsWith("/admin/roles")) return "Roles & Permissions";
  if (p.startsWith("/users")) return "User Management";
  if (p.startsWith("/roles")) return "Roles & Permissions";
  if (p.startsWith("/excel-config")) return "Excel Map Config";
  if (p.startsWith("/clients")) return "Client Directory";
  if (p.startsWith("/replenishment/client")) return "Client Replenishment";
  if (p.startsWith("/replenishment/factory-orders")) return "Factory Orders";
  if (p.startsWith("/replenishment/pending-pullbacks")) return "Pending Pullbacks";
  if (p.startsWith("/replenishment/stock")) return "Stock Replenishment";
  if (p.startsWith("/stock-review")) return "Stock Review";
  if (p.startsWith("/client-replenishment")) return "Client Replenishment";
  if (p.startsWith("/replenishment-history")) return "Replenishment History";
  if (p.startsWith("/stock-replenishment")) return "Stock Replenishment";
  if (p.startsWith("/replenishment-v1")) return "Client Replenishment (Legacy)";
  if (p === "/") return "Dashboard";
  return "DVJ ERP";
}

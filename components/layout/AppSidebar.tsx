"use client";

import {
  Boxes,
  ChevronDown,
  FileSpreadsheet,
  LayoutGrid,
  MessageCircle,
  Moon,
  Package,
  RefreshCw,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { DashboardSession } from "@/components/layout/dashboard-session";
import { sessionHasPermission } from "@/lib/nav-permissions";
import { cn } from "@/lib/utils";

const SIDEBAR_LOGO = "/dv-jewelers.a808f139.png";

type AppSidebarProps = {
  session: DashboardSession;
};

function itemMatches(pathname: string, href: string, match: "exact" | "prefix" = "prefix") {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  indent,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl py-3 text-[13px] font-medium transition-all",
        indent ? "pl-9 pr-4" : "px-4",
        active
          ? "clay-raised font-semibold text-foreground"
          : "text-muted-foreground hover:bg-white/40 hover:text-foreground",
      )}
    >
      <Icon className="size-[17px] shrink-0" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppSidebar({ session }: AppSidebarProps) {
  const pathname = usePathname();
  const replenSubmenuId = useId();
  const isLegacyAdmin = session?.role === "admin";

  const canDashboard =
    Boolean(session) &&
    (isLegacyAdmin ||
      sessionHasPermission(session, "dashboard.view") ||
      sessionHasPermission(session, "replenishment.view"));
  const canReplenishment =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "replenishment.view"));
  const canHistory =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "replenishment_history.view"));
  const canStockReplenishment =
    Boolean(session) &&
    (isLegacyAdmin ||
      sessionHasPermission(session, "stock_replenishment.view") ||
      sessionHasPermission(session, "replenishment.view"));
  const canPendingPullbacks =
    Boolean(session) &&
    (isLegacyAdmin || sessionHasPermission(session, "replenishment.view_pending_pullbacks"));
  const canFactoryOrders =
    Boolean(session) &&
    (isLegacyAdmin || sessionHasPermission(session, "replenishment.view_factory_orders"));
  const canClients =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "clients.view"));
  const canExcel =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "excel_config.view"));

  const replenishmentSectionActive =
    itemMatches(pathname, "/replenishment/client", "exact") ||
    itemMatches(pathname, "/replenishment/stock", "exact") ||
    itemMatches(pathname, "/replenishment/pending-pullbacks", "exact") ||
    itemMatches(pathname, "/replenishment/factory-orders", "exact") ||
    itemMatches(pathname, "/replenishment-history", "prefix") ||
    itemMatches(pathname, "/client-replenishment", "exact") ||
    itemMatches(pathname, "/stock-replenishment", "exact");

  const showReplenishmentGroup =
    canReplenishment || canHistory || canStockReplenishment || canPendingPullbacks || canFactoryOrders;

  const [replenishmentExpanded, setReplenishmentExpanded] = useState(true);

  useEffect(() => {
    if (replenishmentSectionActive) setReplenishmentExpanded(true);
  }, [replenishmentSectionActive]);

  if (!session) return null;

  return (
    <aside className="sticky top-0 z-40 hidden h-screen w-[200px] shrink-0 flex-col bg-sidebar px-3 py-5 lg:flex">
      <Link
        href="/dashboard"
        className="mb-6 block rounded-xl px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
        aria-label="DV Jewelry Corp home"
      >
        <Image
          src={SIDEBAR_LOGO}
          alt="DV Jewelry Corp"
          width={360}
          height={96}
          className="h-15 w-full max-w-[168px] object-contain object-center select-none"
          priority
        />
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Application">
        {canDashboard ? (
          <NavLink
            href="/dashboard"
            label="Dashboard"
            icon={LayoutGrid}
            active={itemMatches(pathname, "/dashboard", "prefix")}
          />
        ) : null}

        {showReplenishmentGroup ? (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setReplenishmentExpanded((e) => !e)}
              aria-expanded={replenishmentExpanded}
              aria-controls={replenSubmenuId}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-[13px] font-medium transition-all",
                replenishmentSectionActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-white/40 hover:text-foreground",
              )}
            >
              <RefreshCw className="size-[17px] shrink-0" strokeWidth={2} />
              <span className="flex-1 truncate">Replenishment</span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  replenishmentExpanded && "rotate-180",
                )}
                strokeWidth={2}
              />
            </button>
            <div
              id={replenSubmenuId}
              className={cn(
                "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                replenishmentExpanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0",
              )}
            >
              <div className="flex flex-col gap-0.5 pt-0.5">
                {canReplenishment || canHistory ? (
                  <NavLink
                    href="/replenishment/client"
                    label="Client Replenishment"
                    icon={Package}
                    active={
                      itemMatches(pathname, "/replenishment/client", "exact") ||
                      itemMatches(pathname, "/replenishment-history", "prefix") ||
                      itemMatches(pathname, "/client-replenishment", "exact")
                    }
                    indent
                  />
                ) : null}
                {canPendingPullbacks ? (
                  <NavLink
                    href="/replenishment/pending-pullbacks"
                    label="Pending Pullbacks"
                    icon={RefreshCw}
                    active={itemMatches(pathname, "/replenishment/pending-pullbacks", "exact")}
                    indent
                  />
                ) : null}
                {canFactoryOrders ? (
                  <NavLink
                    href="/replenishment/factory-orders"
                    label="Factory Orders"
                    icon={Package}
                    active={itemMatches(pathname, "/replenishment/factory-orders", "exact")}
                    indent
                  />
                ) : null}
                {canStockReplenishment ? (
                  <NavLink
                    href="/replenishment/stock"
                    label="Stock Replenishment"
                    icon={Boxes}
                    active={
                      itemMatches(pathname, "/replenishment/stock", "exact") ||
                      itemMatches(pathname, "/stock-replenishment", "exact")
                    }
                    indent
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {canClients ? (
          <NavLink
            href="/clients"
            label="Clients"
            icon={Users}
            active={itemMatches(pathname, "/clients", "prefix")}
          />
        ) : null}

        {canExcel ? (
          <NavLink
            href="/excel-config"
            label="Excel Config"
            icon={FileSpreadsheet}
            active={itemMatches(pathname, "/excel-config", "prefix")}
          />
        ) : null}
      </nav>

      <div className="flex flex-col gap-1 pt-3">
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-white/40 hover:text-foreground"
        >
          <MessageCircle className="size-[17px]" strokeWidth={2} />
          <span>Support</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-white/40 hover:text-foreground"
        >
          <Moon className="size-[17px]" strokeWidth={2} />
          <span>Theme</span>
        </button>
      </div>
    </aside>
  );
}

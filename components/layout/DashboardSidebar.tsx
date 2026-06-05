"use client";

import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  Package,
  RefreshCw,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import type { DashboardSession } from "@/components/layout/dashboard-session";
import { sessionHasPermission } from "@/lib/nav-permissions";

const STORAGE_SIDEBAR_COLLAPSED = "dvj-sidebar-collapsed";
const STORAGE_REPLENISHMENT_EXPANDED = "dvj-nav-replenishment-expanded";
const SIDEBAR_LOGO = "/dv-jewelers.a808f139.png";

const iconStroke = { strokeWidth: 1.5 as const, className: "size-[18px] shrink-0" };

function itemMatches(pathname: string, href: string, match: "exact" | "prefix") {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const TREE_LINE = "border-stone-200";

/** Shared spine + L/elbow per row (~4px fillet: reads as an L, not a T-stub or a deep C). */
function NavTreeList({ children }: { children: ReactNode }) {
  return (
    <ul className={`relative ml-2 mt-0.5 list-none space-y-1 border-l-2 ${TREE_LINE} py-1.5 pl-3`}>
      {children}
    </ul>
  );
}

function SoonBadge() {
  return (
    <span className="shrink-0 rounded-full bg-stone-200/90 px-2 py-px text-[9px] font-semibold uppercase tracking-wide text-stone-600">
      soon
    </span>
  );
}

function NavTreeRow({
  active,
  disabled,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={`pointer-events-none absolute top-1/2 left-0 z-0 h-[14px] w-[14px] -translate-x-[calc(0.75rem+2px)] -translate-y-1/2 border-b-2 border-l-2 ${TREE_LINE} rounded-bl-[10px]`}
        aria-hidden
      />
      <div
        className={[
          "relative z-[1] rounded-lg px-2 py-2 text-[12px] transition motion-safe:duration-150",
          disabled
            ? "cursor-not-allowed text-stone-400"
            : active
              ? "bg-[#f3e8ff] font-semibold text-violet-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
              : "text-stone-600 hover:bg-stone-50/95",
        ].join(" ")}
      >
        {children}
      </div>
    </li>
  );
}

export function DashboardSidebar({ session }: { session: DashboardSession }) {
  const pathname = usePathname();
  const replenSubmenuId = useId();
  const isLegacyAdmin = session?.role === "admin";

  const canReplenishment =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "replenishment.view"));
  const canStockReplenishment =
    Boolean(session) &&
    (isLegacyAdmin ||
      sessionHasPermission(session, "stock_replenishment.view") ||
      sessionHasPermission(session, "replenishment.view"));
  const canHistory =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "replenishment_history.view"));
  const canClients =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "clients.view"));
  const canDashboard =
    Boolean(session) &&
    (isLegacyAdmin ||
      sessionHasPermission(session, "dashboard.view") ||
      sessionHasPermission(session, "replenishment.view"));
  const canExcel =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "excel_config.view"));

  const canPendingPullbacks =
    Boolean(session) &&
    (isLegacyAdmin || sessionHasPermission(session, "replenishment.view_pending_pullbacks"));
  const canFactoryOrders =
    Boolean(session) &&
    (isLegacyAdmin || sessionHasPermission(session, "replenishment.view_factory_orders"));

  const replenishmentSectionActive =
    itemMatches(pathname, "/replenishment/client", "exact") ||
    itemMatches(pathname, "/replenishment/stock", "exact") ||
    itemMatches(pathname, "/replenishment/pending-pullbacks", "exact") ||
    itemMatches(pathname, "/replenishment/factory-orders", "exact") ||
    itemMatches(pathname, "/replenishment-history", "prefix") ||
    itemMatches(pathname, "/client-replenishment", "exact") ||
    itemMatches(pathname, "/stock-replenishment", "exact");

  const [collapsed, setCollapsed] = useState(false);
  const [hydratedCollapsed, setHydratedCollapsed] = useState(false);
  const [replenishmentExpanded, setReplenishmentExpanded] = useState(true);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED) === "1");
    setHydratedCollapsed(true);
    const storedRepl = window.localStorage.getItem(STORAGE_REPLENISHMENT_EXPANDED);
    if (storedRepl === "0") setReplenishmentExpanded(false);
    else if (storedRepl === "1") setReplenishmentExpanded(true);
  }, []);

  useEffect(() => {
    if (replenishmentSectionActive) {
      setReplenishmentExpanded(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_REPLENISHMENT_EXPANDED, "1");
      }
    }
  }, [replenishmentSectionActive]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  const toggleReplenishment = useCallback(() => {
    setReplenishmentExpanded((e) => {
      const next = !e;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_REPLENISHMENT_EXPANDED, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  const widthClass = !hydratedCollapsed ? "w-[252px]" : collapsed ? "w-[68px]" : "w-[252px]";

  const navLinkClass = (active: boolean) =>
    [
      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium motion-safe:transition-colors motion-safe:duration-[120ms]",
      active
        ? "bg-[#f3e8ff] text-violet-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
        : "text-stone-700 hover:bg-stone-50/90",
    ].join(" ");

  const navIconClass = (active: boolean) => (active ? "text-violet-700" : "text-stone-500");

  return (
    <aside
      className={[
        "flex h-full min-h-0 shrink-0 flex-col bg-white px-3 py-5 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out sm:px-4",
        widthClass,
      ].join(" ")}
      aria-label="Sidebar"
    >
      <div
        className={[
          "mb-6 flex min-w-0 shrink-0",
          collapsed ? "flex-col items-center gap-2" : "flex-row items-start justify-between gap-2",
        ].join(" ")}
      >
        <Link
          href="/dashboard"
          className={[
            "flex min-w-0 cursor-pointer items-center rounded-xl py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2",
            collapsed ? "justify-center" : "flex-1 pr-0",
          ].join(" ")}
        >
          <span
            className={[
              "relative block",
              collapsed ? "h-10 w-10 shrink-0" : "h-[52px] min-w-0 w-full flex-1",
            ].join(" ")}
          >
            <Image
              src={SIDEBAR_LOGO}
              alt="DV Jewelry Corp"
              width={360}
              height={96}
              className={[
                "pointer-events-none max-w-full object-contain object-center motion-safe:transition-opacity motion-safe:duration-200 select-none",
                collapsed ? "h-10 w-10" : "h-15 w-full",
              ].join(" ")}
              priority
            />
          </span>
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 motion-safe:transition-colors motion-safe:duration-150 hover:bg-stone-100 hover:text-violet-700"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight strokeWidth={1.5} className="size-4 shrink-0" />
          ) : (
            <ChevronLeft strokeWidth={1.5} className="size-4 shrink-0" />
          )}
        </button>
      </div>

      <nav
        className="-mx-0.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-0.5"
        aria-label="Application"
      >
        {session && !collapsed ? (
          <>
            {canDashboard ? (
              <Link
                href="/dashboard"
                className={navLinkClass(itemMatches(pathname, "/dashboard", "prefix"))}
              >
                <LayoutDashboard
                  {...iconStroke}
                  className={[
                    iconStroke.className,
                    navIconClass(itemMatches(pathname, "/dashboard", "prefix")),
                  ].join(" ")}
                />
                <span className="truncate">Dashboard</span>
              </Link>
            ) : null}

            {/* Replenishment — grouped */}
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={toggleReplenishment}
                aria-expanded={replenishmentExpanded}
                aria-controls={replenSubmenuId}
                className={[
                  "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium motion-safe:transition-colors motion-safe:duration-[120ms]",
                  replenishmentExpanded || replenishmentSectionActive
                    ? "text-stone-900"
                    : "text-stone-700 hover:bg-stone-50/90",
                ].join(" ")}
              >
                <RefreshCw
                  {...iconStroke}
                  className={[
                    iconStroke.className,
                    replenishmentSectionActive ? "text-violet-700" : "text-stone-500",
                  ].join(" ")}
                />
                <span className="flex-1 truncate">Replenishment</span>
                <ChevronDown
                  strokeWidth={1.5}
                  className={[
                    "size-4 shrink-0 text-stone-400 transition-transform motion-safe:[transition-duration:200ms]",
                    replenishmentExpanded ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden
                />
              </button>
              <div
                id={replenSubmenuId}
                className={[
                  "overflow-hidden motion-safe:transition-[max-height,opacity] motion-safe:duration-200 motion-safe:ease-out",
                  replenishmentExpanded ? "max-h-[580px] opacity-100" : "max-h-0 opacity-0",
                ].join(" ")}
              >
                <div className="px-0.5">
                  <NavTreeList>
                  {canReplenishment || canHistory ? (
                    <NavTreeRow
                      active={
                        itemMatches(pathname, "/replenishment/client", "exact") ||
                        itemMatches(pathname, "/replenishment-history", "prefix") ||
                        itemMatches(pathname, "/client-replenishment", "exact")
                      }
                    >
                      <Link href="/replenishment/client" className="flex items-center gap-2.5 py-0.5">
                        <Package
                          strokeWidth={1.5}
                          className={
                            itemMatches(pathname, "/replenishment/client", "exact") ||
                            itemMatches(pathname, "/replenishment-history", "prefix") ||
                            itemMatches(pathname, "/client-replenishment", "exact")
                              ? "size-[16px] shrink-0 text-violet-600"
                              : "size-[16px] shrink-0 text-stone-500"
                          }
                        />
                        <span className="truncate">Client Replenishment</span>
                      </Link>
                    </NavTreeRow>
                  ) : null}
                  {canPendingPullbacks ? (
                    <NavTreeRow active={itemMatches(pathname, "/replenishment/pending-pullbacks", "exact")}>
                      <Link href="/replenishment/pending-pullbacks" className="flex items-center gap-2.5 py-0.5">
                        <RefreshCw
                          strokeWidth={1.5}
                          className={
                            itemMatches(pathname, "/replenishment/pending-pullbacks", "exact")
                              ? "size-[16px] shrink-0 text-violet-600"
                              : "size-[16px] shrink-0 text-stone-500"
                          }
                        />
                        <span className="truncate">Pending Pullbacks</span>
                      </Link>
                    </NavTreeRow>
                  ) : null}
                  {canFactoryOrders ? (
                    <NavTreeRow active={itemMatches(pathname, "/replenishment/factory-orders", "exact")}>
                      <Link href="/replenishment/factory-orders" className="flex items-center gap-2.5 py-0.5">
                        <Package
                          strokeWidth={1.5}
                          className={
                            itemMatches(pathname, "/replenishment/factory-orders", "exact")
                              ? "size-[16px] shrink-0 text-violet-600"
                              : "size-[16px] shrink-0 text-stone-500"
                          }
                        />
                        <span className="truncate">Factory Orders</span>
                      </Link>
                    </NavTreeRow>
                  ) : null}
                  {canStockReplenishment ? (
                    <NavTreeRow
                      active={
                        itemMatches(pathname, "/replenishment/stock", "exact") ||
                        itemMatches(pathname, "/stock-replenishment", "exact")
                      }
                    >
                      <Link href="/replenishment/stock" className="flex items-center gap-2.5 py-0.5">
                        <Boxes
                          strokeWidth={1.5}
                          className={
                            itemMatches(pathname, "/replenishment/stock", "exact") ||
                            itemMatches(pathname, "/stock-replenishment", "exact")
                              ? "size-[16px] shrink-0 text-violet-600"
                              : "size-[16px] shrink-0 text-stone-500"
                          }
                        />
                        <span className="truncate">Stock replenishment</span>
                      </Link>
                    </NavTreeRow>
                  ) : null}
                </NavTreeList>
                </div>
              </div>
            </div>

            {canClients ? (
              <Link
                href="/clients"
                className={navLinkClass(itemMatches(pathname, "/clients", "prefix"))}
              >
                <Users
                  {...iconStroke}
                  className={[
                    iconStroke.className,
                    navIconClass(itemMatches(pathname, "/clients", "prefix")),
                  ].join(" ")}
                />
                <span className="truncate">Clients</span>
              </Link>
            ) : null}

            {canExcel ? (
              <Link
                href="/excel-config"
                className={navLinkClass(itemMatches(pathname, "/excel-config", "prefix"))}
              >
                <FileSpreadsheet
                  {...iconStroke}
                  className={[
                    iconStroke.className,
                    navIconClass(itemMatches(pathname, "/excel-config", "prefix")),
                  ].join(" ")}
                />
                <span className="truncate">Excel map config</span>
              </Link>
            ) : null}
          </>
        ) : null}

        {session && collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            {canDashboard ? (
              <Link
                href="/dashboard"
                title="Dashboard"
                className={[
                  "flex size-10 cursor-pointer items-center justify-center rounded-xl motion-safe:transition-colors motion-safe:duration-[120ms]",
                  itemMatches(pathname, "/dashboard", "prefix")
                    ? "bg-[#f3e8ff] text-violet-800"
                    : "text-stone-500 hover:bg-stone-100 hover:text-violet-700",
                ].join(" ")}
              >
                <LayoutDashboard strokeWidth={1.5} className="size-[18px] shrink-0" />
              </Link>
            ) : null}
            {canReplenishment || canHistory ? (
              <Link
                href="/replenishment/client"
                title="Client Replenishment"
                className={[
                  "flex size-10 cursor-pointer items-center justify-center rounded-xl motion-safe:transition-colors motion-safe:duration-[120ms]",
                  itemMatches(pathname, "/replenishment/client", "exact") ||
                  itemMatches(pathname, "/replenishment-history", "prefix") ||
                  itemMatches(pathname, "/client-replenishment", "exact")
                    ? "bg-[#f3e8ff] text-violet-800"
                    : "text-stone-500 hover:bg-stone-100 hover:text-violet-700",
                ].join(" ")}
              >
                <Package strokeWidth={1.5} className="size-[18px] shrink-0" />
              </Link>
            ) : null}
            {canStockReplenishment ? (
              <Link
                href="/replenishment/stock"
                title="Stock replenishment"
                className={[
                  "flex size-10 cursor-pointer items-center justify-center rounded-xl motion-safe:transition-colors motion-safe:duration-[120ms]",
                  itemMatches(pathname, "/replenishment/stock", "exact") ||
                  itemMatches(pathname, "/stock-replenishment", "exact")
                    ? "bg-[#f3e8ff] text-violet-800"
                    : "text-stone-500 hover:bg-stone-100 hover:text-violet-700",
                ].join(" ")}
              >
                <Boxes strokeWidth={1.5} className="size-[18px] shrink-0" />
              </Link>
            ) : null}
            {canClients ? (
              <Link
                href="/clients"
                title="Clients"
                className={[
                  "flex size-10 cursor-pointer items-center justify-center rounded-xl motion-safe:transition-colors motion-safe:duration-[120ms]",
                  itemMatches(pathname, "/clients", "prefix")
                    ? "bg-[#f3e8ff] text-violet-800"
                    : "text-stone-500 hover:bg-stone-100 hover:text-violet-700",
                ].join(" ")}
              >
                <Users strokeWidth={1.5} className="size-[18px] shrink-0" />
              </Link>
            ) : null}
            {canExcel ? (
              <Link
                href="/excel-config"
                title="Excel map config"
                className={[
                  "flex size-10 cursor-pointer items-center justify-center rounded-xl motion-safe:transition-colors motion-safe:duration-[120ms]",
                  itemMatches(pathname, "/excel-config", "prefix")
                    ? "bg-[#f3e8ff] text-violet-800"
                    : "text-stone-500 hover:bg-stone-100 hover:text-violet-700",
                ].join(" ")}
              >
                <FileSpreadsheet strokeWidth={1.5} className="size-[18px] shrink-0" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

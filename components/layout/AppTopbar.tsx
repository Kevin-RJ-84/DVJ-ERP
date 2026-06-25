"use client";

import {
  Bell,
  ChevronRight,
  LogOut,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  User,
  UserRoundCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardSession } from "@/components/layout/dashboard-session";
import { UserClayAvatar } from "@/components/users/UserClayAvatar";
import { UploadModal } from "@/components/replenishment/UploadModal";
import { dashboardNavbarGroupTitle } from "@/lib/dashboard-navbar-title";
import { sessionHasPermission } from "@/lib/nav-permissions";
import { cn } from "@/lib/utils";

type AppTopbarProps = { session: DashboardSession };

type ErpSyncStatus = {
  lastStockSync: string | null;
  lastSalesSync: string | null;
  syncEnabled: boolean;
  intervalMinutes: number;
};

function formatRelativeSyncTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Synced just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Synced just now";
  if (mins < 60) return `Synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Synced ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days} day${days === 1 ? "" : "s"} ago`;
}

function sessionDisplayName(session: DashboardSession) {
  if (!session) return "Account";
  const name = `${session.firstName ?? ""} ${session.lastName ?? ""}`.trim();
  return name || session.username || session.email;
}

const menuPanel =
  "absolute top-full right-0 z-[100] mt-2 overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-pop";

export function AppTopbar({ session }: AppTopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const modalSearchRef = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchShortcutLabel, setSearchShortcutLabel] = useState("Ctrl K");
  const [toolbarHydrated, setToolbarHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ErpSyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const isLegacyAdmin = session?.role === "admin";
  const canSettings =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "settings.view"));
  const canUsers =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "users.view"));
  const canRoles =
    Boolean(session) && (isLegacyAdmin || sessionHasPermission(session, "roles.view"));
  const showSystemConfig = canSettings || canUsers || canRoles;
  const canUpload =
    Boolean(session) &&
    (isLegacyAdmin ||
      sessionHasPermission(session, "upload.stock") ||
      sessionHasPermission(session, "upload.sales"));
  const canSyncErp =
    Boolean(session) &&
    (isLegacyAdmin ||
      sessionHasPermission(session, "upload.stock") ||
      sessionHasPermission(session, "upload.sales"));

  useEffect(() => {
    setToolbarHydrated(true);
    setSearchShortcutLabel(/Mac|iPhone|iPod|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);

  useEffect(() => {
    if (!canSyncErp) return;
    let cancelled = false;
    void fetch("/api/erp/sync/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ErpSyncStatus | null) => {
        if (!cancelled && data) setSyncStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSyncErp]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [stockRes, salesRes] = await Promise.all([
        fetch("/api/erp/sync/stock", { method: "POST" }),
        fetch("/api/erp/sync/sales", { method: "POST" }),
      ]);
      const stockData = await stockRes.json();
      const salesData = await salesRes.json();

      const stockOk = stockData.success === true;
      const salesOk = salesData.success === true;

      if (stockOk || salesOk) {
        const stockCount = (stockData.updated ?? 0) + (stockData.inserted ?? 0);
        const salesCount = (salesData.updated ?? 0) + (salesData.inserted ?? 0);
        setToast({
          type: "success",
          message: `Synced: ${stockCount} stock updated, ${salesCount} sales updated`,
        });
        const syncedAt = new Date().toISOString();
        setSyncStatus((prev) =>
          prev
            ? {
                ...prev,
                lastStockSync: stockOk ? syncedAt : prev.lastStockSync,
                lastSalesSync: salesOk ? syncedAt : prev.lastSalesSync,
              }
            : {
                lastStockSync: stockOk ? syncedAt : null,
                lastSalesSync: salesOk ? syncedAt : null,
                syncEnabled: true,
                intervalMinutes: 30,
              },
        );
      }

      if (!stockOk && !salesOk) {
        const errMsg = stockData.error ?? salesData.error ?? "Unknown error";
        setToast({ type: "error", message: `Sync failed: ${errMsg}` });
      } else if (!stockOk || !salesOk) {
        const parts: string[] = [];
        if (!stockOk) parts.push(`Stock: ${stockData.error ?? stockData.message ?? "failed"}`);
        if (!salesOk) parts.push(`Sales: ${salesData.error ?? salesData.message ?? "failed"}`);
        setToast({ type: "error", message: parts.join("; ") });
      }
    } catch (err) {
      setToast({ type: "error", message: `Sync failed: ${String(err)}` });
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!searchModalOpen) return;
    const id = requestAnimationFrame(() => modalSearchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [searchModalOpen]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setNotifOpen(false);
        setConfigOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen(true);
        return;
      }
      if (e.key === "Escape") {
        if (searchModalOpen) {
          setSearchModalOpen(false);
          return;
        }
        setProfileOpen(false);
        setNotifOpen(false);
        setConfigOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchModalOpen]);

  const closeAll = useCallback(() => {
    setProfileOpen(false);
    setNotifOpen(false);
    setConfigOpen(false);
    setSearchModalOpen(false);
  }, []);

  const signOut = useCallback(async () => {
    closeAll();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router, closeAll]);

  const barTitle = dashboardNavbarGroupTitle(pathname);

  return (
    <>
      <header
        ref={rootRef}
        className="flex w-full shrink-0 flex-wrap items-center gap-3 px-6 py-4 lg:px-8"
      >
        <h1
          className="min-w-0 shrink-0 text-[22px] font-bold tracking-tight text-foreground"
          title={barTitle}
        >
          {barTitle}
        </h1>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative hidden w-[min(100vw-12rem,380px)] min-w-[260px] sm:block">
              <Search
                className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
                strokeWidth={2.2}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => setSearchModalOpen(true)}
                className="clay-inset flex h-10 w-full cursor-pointer items-center rounded-full py-0 pr-14 pl-11 text-left text-sm text-muted-foreground transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                aria-label="Open search"
                aria-keyshortcuts="Control+K Meta+K"
              >
                <span className="truncate">Search clients, memos, SKUs…</span>
              </button>
              <kbd
                className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded-md border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline"
                suppressHydrationWarning
              >
                {searchShortcutLabel}
              </kbd>
            </div>
            {canUpload ? (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                title="Upload Excel"
                aria-label="Upload Excel"
                className="clay-cta inline-flex size-10 shrink-0 items-center justify-center rounded-full transition hover:opacity-95"
              >
                <Upload className="size-4" strokeWidth={2.2} aria-hidden />
              </button>
            ) : null}
          </div>

          {canUpload ? (
            <UploadModal mode="controlled" open={uploadOpen} onClose={() => setUploadOpen(false)} />
          ) : null}

          {canSyncErp ? (
            <button
              type="button"
              onClick={() => void handleManualSync()}
              disabled={isSyncing}
              title={
                isSyncing
                  ? "Syncing from ERP…"
                  : syncStatus?.lastStockSync || syncStatus?.lastSalesSync
                    ? formatRelativeSyncTime(
                        syncStatus.lastStockSync ?? syncStatus.lastSalesSync ?? "",
                      )
                    : "Sync ERP"
              }
              aria-label={isSyncing ? "Syncing from ERP" : "Sync ERP"}
              className="clay-raised flex size-10 items-center justify-center rounded-full transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-4", isSyncing && "animate-spin")}
                strokeWidth={2.2}
                aria-hidden
              />
            </button>
          ) : null}

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setProfileOpen(false);
                setConfigOpen(false);
              }}
              className="clay-raised relative flex size-10 items-center justify-center rounded-full transition hover:scale-[1.03]"
              aria-label="Notifications"
              aria-expanded={notifOpen}
            >
              <Bell className="size-4" strokeWidth={2.2} />
              <span className="absolute top-2 right-2 size-1.5 rounded-full bg-red-500" />
            </button>
            {notifOpen ? (
              <div className={cn(menuPanel, "w-[min(100vw-2rem,20rem)] py-4")} role="dialog" aria-label="Notifications">
                <p className="px-4 text-sm font-semibold text-foreground">Notifications</p>
                <p className="mt-3 px-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => {
                  const next = !v;
                  if (!next) setConfigOpen(false);
                  return next;
                });
                setNotifOpen(false);
              }}
              className="flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full p-0 shadow-[0_0_0_4px_#ffffff,0_2px_10px_rgba(20,20,18,0.08)] transition hover:scale-[1.03]"
              aria-label="Account menu"
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              {session ? (
                <UserClayAvatar
                  seed={session.userId}
                  avatarKey={session.avatarKey}
                  size={40}
                  alt={sessionDisplayName(session)}
                  className="size-10 rounded-full"
                />
              ) : null}
            </button>
            {profileOpen && session ? (
              <div className={cn(menuPanel, "w-60")} role="menu">
                <Link
                  href="/settings/profile"
                  role="menuitem"
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                  onClick={closeAll}
                >
                  <User strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                  My profile
                </Link>
                {showSystemConfig ? (
                  <div>
                    <button
                      type="button"
                      role="menuitem"
                      aria-expanded={configOpen}
                      onClick={() => setConfigOpen((v) => !v)}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      <span className="flex items-center gap-2.5">
                        <Settings2 strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                        System configuration
                      </span>
                      <ChevronRight
                        strokeWidth={2}
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          configOpen && "rotate-90",
                        )}
                      />
                    </button>
                    {configOpen ? (
                      <div className="border-t border-border bg-secondary/50 py-1" role="menu">
                        {canSettings ? (
                          <Link
                            href="/settings"
                            role="menuitem"
                            className="flex items-center gap-2.5 py-2 pr-3 pl-9 text-sm font-medium text-foreground hover:bg-secondary"
                            onClick={closeAll}
                          >
                            <SlidersHorizontal strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                            System settings
                          </Link>
                        ) : null}
                        {canUsers ? (
                          <Link
                            href="/admin/users"
                            role="menuitem"
                            className="flex items-center gap-2.5 py-2 pr-3 pl-9 text-sm font-medium text-foreground hover:bg-secondary"
                            onClick={closeAll}
                          >
                            <UserRoundCog strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                            User management
                          </Link>
                        ) : null}
                        {canRoles ? (
                          <Link
                            href="/admin/roles"
                            role="menuitem"
                            className="flex items-center gap-2.5 py-2 pr-3 pl-9 text-sm font-medium text-foreground hover:bg-secondary"
                            onClick={closeAll}
                          >
                            <ShieldCheck strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                            Roles &amp; permissions
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-secondary"
                >
                  <LogOut strokeWidth={2} className="size-4 shrink-0" />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {searchModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setSearchModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-search-heading"
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="global-search-heading" className="sr-only">
              Global search
            </h2>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2.2}
                aria-hidden
              />
              <input
                ref={modalSearchRef}
                type="search"
                placeholder="Search clients, memos, SKUs…"
                className="w-full rounded-xl border border-border bg-card py-3.5 pr-4 pl-11 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-ring/20"
                aria-label="Search across the application"
              />
            </div>
            <p className="mt-4 text-center text-sm font-medium text-muted-foreground">
              Search across stock, sales, and clients
            </p>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={cn(
            "fixed top-4 right-4 z-[300] max-w-sm rounded-xl border px-4 py-2.5 text-sm font-medium shadow-pop",
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-600",
          )}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}

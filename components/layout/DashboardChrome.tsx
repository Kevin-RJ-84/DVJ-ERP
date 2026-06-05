"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import type { DashboardSession } from "@/components/layout/dashboard-session";

type DashboardChromeProps = {
  session: DashboardSession;
  children: ReactNode;
};

/** Shared sidebar + topbar; refreshes session from cookie if SSR missed permissions. */
export function DashboardChrome({ session: initialSession, children }: DashboardChromeProps) {
  const [session, setSession] = useState<DashboardSession>(initialSession);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    if (initialSession?.permissions?.length) return;

    let cancelled = false;
    void fetch("/api/auth/session", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { session?: DashboardSession } | null) => {
        if (!cancelled && data?.session) {
          setSession(data.session);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  return (
    <div className="flex h-[100dvh] min-h-0 w-full bg-background text-foreground">
      <AppSidebar session={session} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopbar session={session} />
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

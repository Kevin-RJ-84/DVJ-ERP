"use client";

import type { DashboardSession } from "@/components/layout/dashboard-session";
import {
  ActivitySummary,
  CategoryComposition,
  KpiBubbles,
  LivePulse,
  MemoStatus,
  RestockClay,
  RevenueClay,
  SalesVsForecast,
  TopClientsClay,
  TopSellingStyles,
} from "@/components/dashboard/Bento";
import { useDashboardData } from "@/components/dashboard/useDashboardData";

export type DashboardPageProps = {
  session?: DashboardSession;
  canUploadStock?: boolean;
  canUploadSales?: boolean;
  canClientReplenishment?: boolean;
  canStockReplenishment?: boolean;
  canMissingStockCount?: boolean;
  canStockReviewList?: boolean;
};

export function DashboardPage(_props: DashboardPageProps) {
  const dashboard = useDashboardData();

  return (
    <div className="min-w-0 flex-1 px-6 py-5 lg:px-8 lg:py-6">
      {dashboard.error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {dashboard.error}
          </div>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <RevenueClay dashboard={dashboard} />
          <KpiBubbles dashboard={dashboard} />
          <CategoryComposition dashboard={dashboard} />
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <TopClientsClay />
            <RestockClay dashboard={dashboard} />
          </div>
          <SalesVsForecast dashboard={dashboard} />
          </div>

        <div className="min-w-0 space-y-4">
          <TopSellingStyles />
          <ActivitySummary dashboard={dashboard} />
          <LivePulse dashboard={dashboard} />
          <MemoStatus dashboard={dashboard} />
            </div>
          </div>

      <footer className="mt-2 flex items-center justify-between pt-5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>DV Jewelry Corp</span>
        <span>Central Ledger · v3.0 · FY 2026</span>
      </footer>
    </div>
  );
}

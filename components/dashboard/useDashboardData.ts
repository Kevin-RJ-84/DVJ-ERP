"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CategoryCompositionResult,
  MemoStatusSlice,
  MonthlySalesRow,
  RecentActivityEvent,
  SalesByCategoryRow,
} from "@/lib/dashboard";

export type DashboardMetricsPayload = {
  totalSalesYear: number;
  totalSalesPeriod: number;
  totalSalesWeek: number;
  netProfitYear: number;
  netProfitPeriod: number;
  marginPercentYear: number | null;
  marginPercentPeriod: number | null;
  activeMemoLines: number;
  overdueMemos: number;
  expiringSoonMemos: number;
  trendYoY: number | null;
  trendPeriod: number | null;
  trendWeek: number | null;
  trendProfitYoY: number | null;
  trendProfitPeriod: number | null;
};

export type RestockWatchlistPayload = {
  items: Array<{
    styleNo: string;
    productDescription: string;
    currentStock: number;
    minThreshold: number;
    severity: "critical" | "warning";
    status: string;
  }>;
  totalAlerts: number;
  criticalCount: number;
};

export type ActivityTodayPayload = {
  replenishmentCount: number;
  itemCount: number;
  expiringMemos7Days: number;
  criticalStockAlerts: number;
  riskCount: number;
};

export const DASHBOARD_SLICES = [
  "metrics",
  "monthlySales",
  "categoryComposition",
  "salesByCategory",
  "memoStatus",
  "restock",
  "activityToday",
  "recentActivity",
] as const;

export type DashboardSliceKey = (typeof DASHBOARD_SLICES)[number];

export type DashboardLoadingMap = Record<DashboardSliceKey, boolean>;

export type DashboardDataState = {
  /** Per-chart loading — false as soon as that slice returns. */
  loading: DashboardLoadingMap;
  sliceErrors: Partial<Record<DashboardSliceKey, string>>;
  metrics: DashboardMetricsPayload | null;
  monthlySales: MonthlySalesRow[] | null;
  categoryComposition: CategoryCompositionResult | null;
  salesByCategory: SalesByCategoryRow[] | null;
  memoStatus: { slices: MemoStatusSlice[]; total: number } | null;
  restock: RestockWatchlistPayload | null;
  activityToday: ActivityTodayPayload | null;
  recentActivity: RecentActivityEvent[] | null;
};

function initialLoading(): DashboardLoadingMap {
  return Object.fromEntries(DASHBOARD_SLICES.map((k) => [k, true])) as DashboardLoadingMap;
}

const INITIAL_DATA: Omit<DashboardDataState, "loading" | "sliceErrors"> = {
  metrics: null,
  monthlySales: null,
  categoryComposition: null,
  salesByCategory: null,
  memoStatus: null,
  restock: null,
  activityToday: null,
  recentActivity: null,
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** True until that chart’s request has finished (success or error). */
export function isSliceLoading(
  dashboard: DashboardDataState | undefined,
  key: DashboardSliceKey,
): boolean {
  if (!dashboard) return true;
  return dashboard.loading[key];
}

export function useDashboardData() {
  const [state, setState] = useState<DashboardDataState>({
    loading: initialLoading(),
    sliceErrors: {},
    ...INITIAL_DATA,
  });

  const loadSlice = useCallback(
    <K extends DashboardSliceKey>(
      key: K,
      url: string,
      apply: (data: unknown) => Partial<DashboardDataState>,
    ) => {
      setState((s) => ({
        ...s,
        loading: { ...s.loading, [key]: true },
        sliceErrors: (() => {
          const next = { ...s.sliceErrors };
          delete next[key];
          return next;
        })(),
      }));

      void fetchJson<unknown>(url)
        .then((data) => {
          setState((s) => ({
            ...s,
            ...apply(data),
            loading: { ...s.loading, [key]: false },
          }));
        })
        .catch((e) => {
          const message = e instanceof Error ? e.message : "Request failed";
          setState((s) => ({
            ...s,
            loading: { ...s.loading, [key]: false },
            sliceErrors: { ...s.sliceErrors, [key]: message },
          }));
        });
    },
    [],
  );

  const load = useCallback(() => {
    setState({
      loading: initialLoading(),
      sliceErrors: {},
      ...INITIAL_DATA,
    });

    loadSlice("metrics", "/api/dashboard/metrics?period=month", (data) => ({
      metrics: data as DashboardMetricsPayload,
    }));

    loadSlice("monthlySales", "/api/dashboard/monthly-sales?mode=current_year", (data) => ({
      monthlySales: data as MonthlySalesRow[],
    }));

    loadSlice(
      "categoryComposition",
      "/api/dashboard/category-composition?mode=current_year&top=3",
      (data) => ({
        categoryComposition: data as CategoryCompositionResult,
      }),
    );

    loadSlice("salesByCategory", "/api/dashboard/sales-by-category?period=month", (data) => ({
      salesByCategory: data as SalesByCategoryRow[],
    }));

    loadSlice("memoStatus", "/api/dashboard/memo-status", (data) => ({
      memoStatus: data as { slices: MemoStatusSlice[]; total: number },
    }));

    loadSlice("restock", "/api/dashboard/restock-watchlist?limit=5", (data) => ({
      restock: data as RestockWatchlistPayload,
    }));

    loadSlice("activityToday", "/api/dashboard/activity-today", (data) => ({
      activityToday: data as ActivityTodayPayload,
    }));

    loadSlice("recentActivity", "/api/dashboard/recent-activity?limit=10", (data) => {
      const res = data as { events: RecentActivityEvent[] };
      return { recentActivity: res.events };
    });
  }, [loadSlice]);

  useEffect(() => {
    load();
  }, [load]);

  const globalError =
    Object.keys(state.sliceErrors).length > 0
      ? Object.values(state.sliceErrors)[0] ?? null
      : null;

  return { ...state, error: globalError, reload: load };
}

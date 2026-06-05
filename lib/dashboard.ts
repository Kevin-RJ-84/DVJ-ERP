import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type DashboardPeriod = "week" | "month" | "year";

/** Top-selling styles: calendar YTD or entire sales history. */
export type TopStylesPeriod = "year" | "all_time";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Current week Mon–Sun (UTC) containing `ref`. */
export function getWeekRange(ref: Date): { start: Date; end: Date } {
  const t = utcFrom(ref);
  const dow = t.getUTCDay(); // 0 Sun … 6 Sat
  const mondayOffset = (dow + 6) % 7;
  const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - mondayOffset));
  const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - mondayOffset + 6));
  return { start, end };
}

function utcFrom(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function getPreviousWeekRange(ref: Date): { start: Date; end: Date } {
  const { start } = getWeekRange(ref);
  const prevMonday = new Date(start);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const end = new Date(prevMonday);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: prevMonday, end };
}

export function getPeriodRange(period: DashboardPeriod, ref: Date = new Date()): { start: Date; end: Date } {
  const t = utcFrom(ref);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const d = t.getUTCDate();
  if (period === "week") return getWeekRange(ref);
  if (period === "month") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      end: new Date(Date.UTC(y, m + 1, 0)),
    };
  }
  // year → YTD through `t`
  return {
    start: new Date(Date.UTC(y, 0, 1)),
    end: t,
  };
}

export function getPreviousPeriodRange(period: DashboardPeriod, ref: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const t = utcFrom(ref);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const d = t.getUTCDate();
  if (period === "week") return getPreviousWeekRange(ref);
  if (period === "month") {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return { start, end };
  }
  const start = new Date(Date.UTC(y - 1, 0, 1));
  const end = new Date(Date.UTC(y - 1, m, d));
  return { start, end };
}

async function sumSaleValueBetween(start: Date, end: Date): Promise<number> {
  const agg = await db.sales.aggregate({
    where: {
      InvoiceDate: { gte: start, lte: end },
    },
    _sum: { SaleValue: true },
  });
  return Number(agg._sum.SaleValue ?? 0);
}

async function sumProfitBetween(start: Date, end: Date): Promise<number> {
  const rows = await db.$queryRaw<Array<{ profit: unknown }>>(Prisma.sql`
    SELECT COALESCE(SUM(COALESCE(sa."SaleValue", 0) - COALESCE(sa."CRAmount", 0)), 0)::decimal AS profit
    FROM sales sa
    WHERE sa."InvoiceDate" >= ${start}
      AND sa."InvoiceDate" <= ${end}
  `);
  return Number(rows[0]?.profit ?? 0);
}

function marginPercent(sales: number, profit: number): number | null {
  if (sales <= 0) return null;
  return (profit / sales) * 100;
}

export function trendPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function getDashboardMetrics(period: DashboardPeriod) {
  const ref = utcToday();
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = ref.getUTCDate();

  const yearStart = new Date(Date.UTC(y, 0, 1));
  const prevYearStart = new Date(Date.UTC(y - 1, 0, 1));
  const prevYearYtdEnd = new Date(Date.UTC(y - 1, m, d));

  const totalSalesYear = await sumSaleValueBetween(yearStart, ref);
  const prevYearYtdSales = await sumSaleValueBetween(prevYearStart, prevYearYtdEnd);

  const pr = getPeriodRange(period, ref);
  const prPrev = getPreviousPeriodRange(period, ref);
  const totalSalesPeriod = await sumSaleValueBetween(pr.start, pr.end);
  const totalSalesPeriodPrev = await sumSaleValueBetween(prPrev.start, prPrev.end);

  const wk = getWeekRange(ref);
  const wkPrev = getPreviousWeekRange(ref);
  const totalSalesWeek = await sumSaleValueBetween(wk.start, wk.end);
  const totalSalesWeekPrev = await sumSaleValueBetween(wkPrev.start, wkPrev.end);

  const netProfitYear = await sumProfitBetween(yearStart, ref);
  const netProfitPeriod = await sumProfitBetween(pr.start, pr.end);
  const netProfitPeriodPrev = await sumProfitBetween(prPrev.start, prPrev.end);
  const prevYearYtdProfit = await sumProfitBetween(prevYearStart, prevYearYtdEnd);

  const today = ref;
  const expiringLimit = new Date(today);
  expiringLimit.setUTCDate(expiringLimit.getUTCDate() + 30);

  const [activeMemoLines, overdueMemos, expiringSoonMemos] = await Promise.all([
    db.memo_stock.count({ where: { Status: "active" } }),
    db.memo.count({
      where: { IsActive: true, MemoEndDate: { lt: today } },
    }),
    db.memo.count({
      where: {
        IsActive: true,
        MemoEndDate: { gte: today, lte: expiringLimit },
      },
    }),
  ]);

  return {
    totalSalesYear,
    totalSalesPeriod,
    totalSalesWeek,
    netProfitYear,
    netProfitPeriod,
    marginPercentYear: marginPercent(totalSalesYear, netProfitYear),
    marginPercentPeriod: marginPercent(totalSalesPeriod, netProfitPeriod),
    activeMemoLines,
    overdueMemos,
    expiringSoonMemos,
    trendYoY: trendPercent(totalSalesYear, prevYearYtdSales),
    trendPeriod: trendPercent(totalSalesPeriod, totalSalesPeriodPrev),
    trendWeek: trendPercent(totalSalesWeek, totalSalesWeekPrev),
    trendProfitYoY: trendPercent(netProfitYear, prevYearYtdProfit),
    trendProfitPeriod: trendPercent(netProfitPeriod, netProfitPeriodPrev),
  };
}

/** Top clients by sales — period filter for dashboard tabs. */
export type TopClientsPeriod = "month" | "last_3_months" | "all_time";

export type TopClientRow = {
  partyName: string;
  saleValue: number;
  quantity: number;
  growthPercent: number | null;
  overallRank: number | null;
};

export function getTopClientsRange(
  period: TopClientsPeriod,
  ref: Date = utcToday(),
): { start: Date; end: Date } | null {
  if (period === "all_time") return null;
  if (period === "month") return getPeriodRange("month", ref);
  const t = utcFrom(ref);
  const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 2, 1));
  return { start, end: t };
}

function getPreviousTopClientsRange(
  period: TopClientsPeriod,
  ref: Date = utcToday(),
): { start: Date; end: Date } | null {
  if (period === "all_time") return null;
  if (period === "month") return getPreviousPeriodRange("month", ref);
  const current = getTopClientsRange("last_3_months", ref)!;
  const prevEnd = new Date(current.start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(
    Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth() - 2, 1),
  );
  return { start: prevStart, end: prevEnd };
}

export type TopStyleRow = {
  styleNo: string;
  saleValue: number;
  quantity: number;
  productDescription: string | null;
  productType: string | null;
  metal: string | null;
  inStock: boolean;
};

/** Top clients by `sales.SaleValue` for the selected period. */
export async function getTopClients(
  period: TopClientsPeriod,
  limit: number,
): Promise<TopClientRow[]> {
  const ref = utcToday();
  const range = getTopClientsRange(period, ref);
  const prev = getPreviousTopClientsRange(period, ref);

  const dateFilter = range
    ? Prisma.sql`AND sa."InvoiceDate" >= ${range.start} AND sa."InvoiceDate" <= ${range.end}`
    : Prisma.empty;

  const prevFilter =
    prev != null
      ? Prisma.sql`AND sa."InvoiceDate" >= ${prev.start} AND sa."InvoiceDate" <= ${prev.end}`
      : null;

  const rows = await db.$queryRaw<
    Array<{ party: string; sv: unknown; qty: bigint; prev_sv: unknown }>
  >(
    prevFilter
      ? Prisma.sql`
    WITH current AS (
      SELECT COALESCE(NULLIF(TRIM(sa."PartyName"), ''), 'Unknown') AS party,
             COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv,
             COUNT(*)::bigint AS qty
      FROM sales sa
      WHERE 1=1 ${dateFilter}
      GROUP BY 1
    ),
    previous AS (
      SELECT COALESCE(NULLIF(TRIM(sa."PartyName"), ''), 'Unknown') AS party,
             COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
      FROM sales sa
      WHERE 1=1 ${prevFilter}
      GROUP BY 1
    )
    SELECT c.party, c.sv, c.qty, COALESCE(p.sv, 0)::decimal AS prev_sv
    FROM current c
    LEFT JOIN previous p ON p.party = c.party
    ORDER BY c.sv DESC NULLS LAST
    LIMIT ${limit}
  `
      : Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM(sa."PartyName"), ''), 'Unknown') AS party,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv,
           COUNT(*)::bigint AS qty,
           0::decimal AS prev_sv
    FROM sales sa
    WHERE 1=1 ${dateFilter}
    GROUP BY 1
    ORDER BY sv DESC NULLS LAST
    LIMIT ${limit}
  `,
  );

  const partyNames = rows.map((r) => r.party);
  const clientRanks =
    partyNames.length > 0
      ? await db.clients.findMany({
          where: { PartyName: { in: partyNames } },
          select: { PartyName: true, OverallRank: true },
        })
      : [];
  const rankByParty = new Map(clientRanks.map((c) => [c.PartyName, c.OverallRank]));

  return rows.map((r) => {
    const saleValue = Number(r.sv);
    const prevValue = Number(r.prev_sv);
    return {
      partyName: r.party,
      saleValue,
      quantity: Number(r.qty),
      growthPercent: prevFilter ? trendPercent(saleValue, prevValue) : null,
      overallRank: rankByParty.get(r.party) ?? null,
    };
  });
}

export async function getTopStyles(
  period: TopStylesPeriod,
  limit: number,
): Promise<TopStyleRow[]> {
  const ref = utcToday();
  const dateFilter =
    period === "year"
      ? (() => {
          const { start, end } = getPeriodRange("year", ref);
          return Prisma.sql`AND sa."InvoiceDate" >= ${start} AND sa."InvoiceDate" <= ${end}`;
        })()
      : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ sn: string; sv: unknown; qty: bigint }>>(Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM(sa."StyleNo"), ''), '—') AS sn,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv,
           COUNT(*)::bigint AS qty
    FROM sales sa
    WHERE sa."StyleNo" IS NOT NULL
      AND TRIM(sa."StyleNo") <> ''
      ${dateFilter}
    GROUP BY 1
    ORDER BY sv DESC NULLS LAST
    LIMIT ${limit}
  `);

  const styleNos = rows.map((r) => r.sn).filter((s) => s !== "—");
  const stockRows =
    styleNos.length > 0
      ? await db.stock.findMany({
          where: { StyleNo: { in: styleNos } },
          select: {
            StyleNo: true,
            ProductDescription: true,
            ProductType: true,
            Metal: true,
            IsMissing: true,
          },
          distinct: ["StyleNo"],
        })
      : [];
  const stockByStyle = new Map(
    stockRows.map((s) => [s.StyleNo?.trim() ?? "", s]),
  );

  return rows.map((r) => {
    const stock = stockByStyle.get(r.sn);
    return {
      styleNo: r.sn,
      saleValue: Number(r.sv),
      quantity: Number(r.qty),
      productDescription: stock?.ProductDescription?.trim() ?? null,
      productType: stock?.ProductType?.trim() ?? null,
      metal: stock?.Metal?.trim() ?? null,
      inStock: Boolean(stock && !stock.IsMissing),
    };
  });
}

export type MonthlySalesRow = {
  month: string;
  year: number;
  value: number;
  /** Trailing 3-month average of prior actuals (computed; not stored forecast). */
  forecast: number | null;
};

function jsonForLog(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
}

/**
 * Monthly totals per calendar month bucket. Uses DATE_TRUNC so each sale line rolls up to exactly
 * one month; EXTRACT(MONTH) keys are normalized with Number() so pg driver bigint/string keys do not
 * break the month → value map (which previously could leave only January filled or mismatch last-12 joins).
 */
export async function getMonthlySales(mode: "current_year" | "last_12_months"): Promise<MonthlySalesRow[]> {
  const today = utcToday();
  const y = today.getUTCFullYear();

  if (mode === "current_year") {
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y, 11, 31));
    const rows = await db.$queryRaw<Array<{ mo: unknown; sv: unknown }>>(Prisma.sql`
      SELECT (EXTRACT(MONTH FROM DATE_TRUNC('month', sa."InvoiceDate")))::int AS mo,
             COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
      FROM sales sa
      WHERE sa."InvoiceDate"::date >= ${start}::date
        AND sa."InvoiceDate"::date <= ${end}::date
      GROUP BY DATE_TRUNC('month', sa."InvoiceDate")
      ORDER BY DATE_TRUNC('month', sa."InvoiceDate") ASC
    `);
    if (process.env.NODE_ENV !== "production") {
      console.log("[getMonthlySales] current_year raw DB rows:", jsonForLog(rows));
    }

    const byMonth = new Map<number, number>();
    for (const r of rows) {
      const mo = Number(r.mo);
      if (!Number.isFinite(mo) || mo < 1 || mo > 12) continue;
      byMonth.set(mo, Number(r.sv));
    }
    const actuals = MONTH_LABELS.map((month, i) => ({
      month,
      year: y,
      value: byMonth.get(i + 1) ?? 0,
    }));
    return attachTrailingForecast(actuals);
  }

  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const rows = await db.$queryRaw<Array<{ y: unknown; mo: unknown; sv: unknown }>>(Prisma.sql`
    SELECT (EXTRACT(YEAR FROM DATE_TRUNC('month', sa."InvoiceDate")))::int AS y,
           (EXTRACT(MONTH FROM DATE_TRUNC('month', sa."InvoiceDate")))::int AS mo,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
    FROM sales sa
    WHERE sa."InvoiceDate"::date >= ${start}::date
      AND sa."InvoiceDate"::date <= ${end}::date
    GROUP BY DATE_TRUNC('month', sa."InvoiceDate")
    ORDER BY DATE_TRUNC('month', sa."InvoiceDate") ASC
  `);
  if (process.env.NODE_ENV !== "production") {
    console.log("[getMonthlySales] last_12_months raw DB rows:", jsonForLog(rows));
  }

  const list: MonthlySalesRow[] = [];
  for (let i = 0; i < 12; i += 1) {
    const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + i, 1));
    const yy = dt.getUTCFullYear();
    const mm = dt.getUTCMonth() + 1;
    const match = rows.find((r) => Number(r.y) === yy && Number(r.mo) === mm);
    list.push({
      month: MONTH_LABELS[mm - 1] ?? "",
      year: yy,
      value: match ? Number(match.sv) : 0,
      forecast: null,
    });
  }
  return attachTrailingForecast(list);
}

function attachTrailingForecast(rows: Omit<MonthlySalesRow, "forecast">[]): MonthlySalesRow[] {
  const window = 3;
  return rows.map((row, i) => {
    if (i < window) return { ...row, forecast: null };
    const prior = rows.slice(i - window, i).map((r) => r.value);
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
    return { ...row, forecast: Math.round(avg) };
  });
}

export type ExpiringMemoRow = {
  memoNo: string;
  clientName: string;
  itemCount: number;
  memoEndDate: string;
  daysLeft: number;
  severity: "critical" | "warning";
};

export async function getExpiringMemos() {
  const today = utcToday();
  const limitDay = new Date(today);
  limitDay.setUTCDate(limitDay.getUTCDate() + 30);

  const rows = await db.memo.findMany({
    where: {
      IsActive: true,
      MemoEndDate: { gte: today, lte: limitDay },
    },
    select: {
      MemoNo: true,
      MemoEndDate: true,
      Client: { select: { PartyName: true } },
      _count: { select: { MemoStockLinks: true } },
    },
    orderBy: { MemoEndDate: "asc" },
    take: 200,
  });

  const memos: ExpiringMemoRow[] = rows.map((r) => {
    const end = r.MemoEndDate;
    const ms = end.getTime() - today.getTime();
    const daysLeft = Math.max(0, Math.ceil(ms / (86400 * 1000)));
    const severity: "critical" | "warning" = daysLeft <= 7 ? "critical" : "warning";
    return {
      memoNo: r.MemoNo,
      clientName: r.Client?.PartyName ?? "—",
      itemCount: r._count.MemoStockLinks,
      memoEndDate: end.toISOString().slice(0, 10),
      daysLeft,
      severity,
    };
  });

  memos.sort((a, b) => a.daysLeft - b.daysLeft);

  const within7Days = memos.filter((m) => m.daysLeft <= 7).length;
  const within30Days = memos.length;
  return {
    totalExpiring: within30Days,
    within7Days,
    within30Days,
    memos,
  };
}

export type MemoStatusSlice = { name: string; value: number };

export async function getMemoStatusSummary() {
  const today = utcToday();
  const expiringLimit = new Date(today);
  expiringLimit.setUTCDate(expiringLimit.getUTCDate() + 30);

  const [active, returning, expiring, overdue] = await Promise.all([
    db.memo_stock.count({ where: { Status: "active" } }),
    db.memo_stock.count({ where: { Status: "returned" } }),
    db.memo.count({
      where: {
        IsActive: true,
        MemoEndDate: { gte: today, lte: expiringLimit },
      },
    }),
    db.memo.count({
      where: { IsActive: true, MemoEndDate: { lt: today } },
    }),
  ]);

  const slices: MemoStatusSlice[] = [
    { name: "Active", value: active },
    { name: "Returning", value: returning },
    { name: "Expiring", value: expiring },
    { name: "Overdue", value: overdue },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);
  return { slices, total };
}

export type CategoryCompositionRow = {
  month: string;
  [category: string]: string | number;
};

export type CategoryCompositionResult = {
  dimension: "productType";
  categories: string[];
  rows: CategoryCompositionRow[];
};

/** Monthly sales grouped by ProductType (top categories + Other). */
export async function getCategoryComposition(
  mode: "current_year" | "last_12_months",
  topN = 3,
): Promise<CategoryCompositionResult> {
  const monthly = await getMonthlySales(mode);
  const y = utcToday().getUTCFullYear();
  const start =
    mode === "current_year"
      ? new Date(Date.UTC(y, 0, 1))
      : new Date(Date.UTC(utcToday().getUTCFullYear(), utcToday().getUTCMonth() - 11, 1));
  const end =
    mode === "current_year"
      ? new Date(Date.UTC(y, 11, 31))
      : new Date(Date.UTC(utcToday().getUTCFullYear(), utcToday().getUTCMonth() + 1, 0));

  const totals = await db.$queryRaw<Array<{ cat: string; sv: unknown }>>(Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM(sa."ProductType"), ''), 'Other') AS cat,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
    FROM sales sa
    WHERE sa."InvoiceDate"::date >= ${start}::date
      AND sa."InvoiceDate"::date <= ${end}::date
    GROUP BY 1
    ORDER BY sv DESC NULLS LAST
    LIMIT 20
  `);
  const topCats = totals
    .slice(0, topN)
    .map((r) => r.cat)
    .filter((c) => c !== "Other");
  const categories = [...topCats, "Other"];

  const monthRows = await db.$queryRaw<
    Array<{ y: unknown; mo: unknown; cat: string; sv: unknown }>
  >(Prisma.sql`
    SELECT (EXTRACT(YEAR FROM DATE_TRUNC('month', sa."InvoiceDate")))::int AS y,
           (EXTRACT(MONTH FROM DATE_TRUNC('month', sa."InvoiceDate")))::int AS mo,
           COALESCE(NULLIF(TRIM(sa."ProductType"), ''), 'Other') AS cat,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
    FROM sales sa
    WHERE sa."InvoiceDate"::date >= ${start}::date
      AND sa."InvoiceDate"::date <= ${end}::date
    GROUP BY DATE_TRUNC('month', sa."InvoiceDate"),
             COALESCE(NULLIF(TRIM(sa."ProductType"), ''), 'Other')
    ORDER BY DATE_TRUNC('month', sa."InvoiceDate") ASC
  `);

  const rows: CategoryCompositionRow[] = monthly.map((m) => {
    const row: CategoryCompositionRow = { month: m.month };
    for (const cat of categories) row[cat] = 0;
    const matches = monthRows.filter(
      (r) => MONTH_LABELS[Number(r.mo) - 1] === m.month && Number(r.y) === m.year,
    );
    let other = 0;
    for (const r of matches) {
      const val = Number(r.sv);
      if (topCats.includes(r.cat)) row[r.cat] = (Number(row[r.cat]) || 0) + val;
      else other += val;
    }
    row.Other = (Number(row.Other) || 0) + other;
    return row;
  });

  return { dimension: "productType", categories, rows };
}

export type SalesByCategoryRow = { category: string; actual: number; forecast: number | null };

export async function getSalesByCategory(period: DashboardPeriod): Promise<SalesByCategoryRow[]> {
  const { start, end } = getPeriodRange(period, utcToday());
  const prev = getPreviousPeriodRange(period, utcToday());

  const rows = await db.$queryRaw<Array<{ cat: string; sv: unknown }>>(Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM(sa."ProductType"), ''), 'Other') AS cat,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
    FROM sales sa
    WHERE sa."InvoiceDate" >= ${start}
      AND sa."InvoiceDate" <= ${end}
    GROUP BY 1
    ORDER BY sv DESC NULLS LAST
    LIMIT 8
  `);

  const prevRows = await db.$queryRaw<Array<{ cat: string; sv: unknown }>>(Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM(sa."ProductType"), ''), 'Other') AS cat,
           COALESCE(SUM(sa."SaleValue"), 0)::decimal AS sv
    FROM sales sa
    WHERE sa."InvoiceDate" >= ${prev.start}
      AND sa."InvoiceDate" <= ${prev.end}
    GROUP BY 1
  `);
  const prevMap = new Map(prevRows.map((r) => [r.cat, Number(r.sv)]));

  return rows.map((r) => ({
    category: r.cat,
    actual: Number(r.sv),
    forecast: prevMap.get(r.cat) ?? null,
  }));
}

export type RestockWatchlistItem = {
  styleNo: string;
  productDescription: string;
  currentStock: number;
  minThreshold: number;
  severity: "critical" | "warning";
  status: string;
};

export async function getRestockWatchlist(limit: number): Promise<{
  items: RestockWatchlistItem[];
  totalAlerts: number;
  criticalCount: number;
}> {
  const { getStockReplenishmentReport } = await import("@/lib/stock-replenishment");
  const report = await getStockReplenishmentReport();
  const items = report.items.slice(0, limit).map((i) => ({
    styleNo: i.styleNo,
    productDescription: i.productDescription || i.styleNo,
    currentStock: i.currentStock,
    minThreshold: i.minThreshold,
    severity: i.severity,
    status: i.severity === "critical" ? "Critical" : "Low",
  }));
  return {
    items,
    totalAlerts: report.totalAlerts,
    criticalCount: report.criticalCount,
  };
}

export async function getActivityToday() {
  const today = utcToday();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const [replenishmentCount, itemCount, expiring7, criticalStock] = await Promise.all([
    db.replenishments.count({
      where: {
        IsUndone: false,
        ReplenishedAt: { gte: today, lt: tomorrow },
      },
    }),
    db.replenishment_items.count({
      where: {
        IsActive: true,
        CreatedAt: { gte: today, lt: tomorrow },
      },
    }),
    db.memo.count({
      where: {
        IsActive: true,
        MemoEndDate: {
          gte: today,
          lte: new Date(today.getTime() + 7 * 86400000),
        },
      },
    }),
    (async () => {
      const { getRestockAlertCounts } = await import("@/lib/dashboard-restock-fast");
      const counts = await getRestockAlertCounts();
      return counts.criticalCount;
    })(),
  ]);

  return {
    replenishmentCount,
    itemCount,
    expiringMemos7Days: expiring7,
    criticalStockAlerts: criticalStock,
    riskCount: expiring7 + criticalStock,
  };
}

export type RecentActivityEvent = {
  id: string;
  tag: string;
  text: string;
  at: string;
  sortAt: number;
};

export async function getRecentActivity(limit: number): Promise<RecentActivityEvent[]> {
  const events: RecentActivityEvent[] = [];

  const [statusLogs, pullbacks, imports, newClients] = await Promise.all([
    db.replenishment_status_log.findMany({
      orderBy: { ChangedAt: "desc" },
      take: limit,
      select: {
        LogID: true,
        InvoiceNo: true,
        StyleNo: true,
        FromStatus: true,
        ToStatus: true,
        ChangedAt: true,
      },
    }),
    db.pullback_history.findMany({
      orderBy: { ContactedAt: "desc" },
      take: limit,
      select: {
        HistoryID: true,
        Channel: true,
        ClientResponse: true,
        ContactedAt: true,
        ReplenishmentItem: {
          select: { InvoiceNo: true, StyleNo: true },
        },
      },
    }),
    db.excel_mappings.findMany({
      where: { LastImportAt: { not: null } },
      orderBy: { LastImportAt: "desc" },
      take: 5,
    }),
    db.clients.findMany({
      orderBy: { CreatedAt: "desc" },
      take: 5,
      select: { ClientID: true, PartyName: true, CreatedAt: true },
    }),
  ]);

  for (const log of statusLogs) {
    const at = log.ChangedAt;
    events.push({
      id: log.LogID,
      tag: "Replenishment",
      text: `Invoice ${log.InvoiceNo} · ${log.StyleNo}: ${log.FromStatus ?? "—"} → ${log.ToStatus}`,
      at: at.toISOString(),
      sortAt: at.getTime(),
    });
  }

  for (const p of pullbacks) {
    const at = p.ContactedAt;
    const inv = p.ReplenishmentItem?.InvoiceNo ?? "—";
    events.push({
      id: p.HistoryID,
      tag: "Pullback",
      text: `${inv} · ${p.Channel} contact · ${p.ClientResponse}`,
      at: at.toISOString(),
      sortAt: at.getTime(),
    });
  }

  for (const imp of imports) {
    if (!imp.LastImportAt) continue;
    const at = imp.LastImportAt;
    events.push({
      id: imp.MappingID,
      tag: "Sync",
      text: `${imp.ReportType} import · +${imp.LastImportInserted ?? 0} / ~${imp.LastImportUpdated ?? 0} updated`,
      at: at.toISOString(),
      sortAt: at.getTime(),
    });
  }

  for (const c of newClients) {
    const at = c.CreatedAt;
    events.push({
      id: c.ClientID,
      tag: "Client",
      text: `New client · ${c.PartyName}`,
      at: at.toISOString(),
      sortAt: at.getTime(),
    });
  }

  events.sort((a, b) => b.sortAt - a.sortAt);
  return events.slice(0, limit);
}

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getConfig, getConfigInt } from "@/lib/config";
import { availableStockFilter } from "@/lib/stock-replenishment";

export type RestockAlertRow = {
  styleNo: string;
  productDescription: string;
  currentStock: number;
  minThreshold: number;
  severity: "critical" | "warning";
};

function parseMode(raw: string): "manual" | "velocity" | "global" {
  const m = raw.toLowerCase();
  if (m === "velocity" || m === "global") return m;
  return "manual";
}

type AlertQueryRow = {
  sn: string;
  current_stock: number;
  min_qty: number;
};

async function queryAlerts(mode: "manual" | "velocity" | "global", limit: number): Promise<AlertQueryRow[]> {
  if (mode === "global") {
    const globalValue = await getConfigInt("stock_threshold_global_value");
    return db.$queryRaw<AlertQueryRow[]>(Prisma.sql`
      WITH stock_counts AS (
        SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::int AS current_stock
        FROM stock s
        WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
          AND ${availableStockFilter}
        GROUP BY TRIM(s."StyleNo")
      )
      SELECT sc.sn,
             sc.current_stock,
             ${globalValue}::int AS min_qty
      FROM stock_counts sc
      WHERE ${globalValue} > 0 AND sc.current_stock < ${globalValue}
      ORDER BY (${globalValue} - sc.current_stock) DESC
      LIMIT ${limit}
    `);
  }

  if (mode === "manual") {
    return db.$queryRaw<AlertQueryRow[]>(Prisma.sql`
      WITH stock_counts AS (
        SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::int AS current_stock
        FROM stock s
        WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
          AND ${availableStockFilter}
        GROUP BY TRIM(s."StyleNo")
      )
      SELECT TRIM(st."StyleNo") AS sn,
             COALESCE(sc.current_stock, 0)::int AS current_stock,
             st."MinQuantity"::int AS min_qty
      FROM stock_thresholds st
      LEFT JOIN stock_counts sc ON sc.sn = TRIM(st."StyleNo")
      WHERE st."MinQuantity" > 0
        AND COALESCE(sc.current_stock, 0) < st."MinQuantity"
      ORDER BY (st."MinQuantity" - COALESCE(sc.current_stock, 0)) DESC
      LIMIT ${limit}
    `);
  }

  const historyMonths = Math.max(1, await getConfigInt("stock_velocity_history_months"));
  const bufferMonths = Math.max(1, await getConfigInt("stock_velocity_buffer_months"));
  const historyStart = new Date();
  historyStart.setUTCMonth(historyStart.getUTCMonth() - historyMonths);

  return db.$queryRaw<AlertQueryRow[]>(Prisma.sql`
    WITH stock_counts AS (
      SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::int AS current_stock
      FROM stock s
      WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
        AND ${availableStockFilter}
      GROUP BY TRIM(s."StyleNo")
    ),
    velocity AS (
      SELECT TRIM(sa."StyleNo") AS sn,
             CEIL(COUNT(*)::numeric / ${historyMonths} * ${bufferMonths})::int AS min_qty
      FROM sales sa
      WHERE sa."StyleNo" IS NOT NULL AND TRIM(sa."StyleNo") <> ''
        AND sa."InvoiceDate" >= ${historyStart}
      GROUP BY TRIM(sa."StyleNo")
    )
    SELECT v.sn,
           COALESCE(sc.current_stock, 0)::int AS current_stock,
           v.min_qty
    FROM velocity v
    LEFT JOIN stock_counts sc ON sc.sn = v.sn
    WHERE v.min_qty > 0 AND COALESCE(sc.current_stock, 0) < v.min_qty
    ORDER BY (v.min_qty - COALESCE(sc.current_stock, 0)) DESC
    LIMIT ${limit}
  `);
}

async function countAlerts(mode: "manual" | "velocity" | "global"): Promise<{
  total: number;
  critical: number;
}> {
  if (mode === "global") {
    const globalValue = await getConfigInt("stock_threshold_global_value");
    const rows = await db.$queryRaw<Array<{ total: bigint; critical: bigint }>>(Prisma.sql`
      WITH stock_counts AS (
        SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::int AS current_stock
        FROM stock s
        WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
          AND ${availableStockFilter}
        GROUP BY TRIM(s."StyleNo")
      )
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE sc.current_stock < (${globalValue} * 0.5))::bigint AS critical
      FROM stock_counts sc
      WHERE ${globalValue} > 0 AND sc.current_stock < ${globalValue}
    `);
    return { total: Number(rows[0]?.total ?? 0), critical: Number(rows[0]?.critical ?? 0) };
  }

  if (mode === "manual") {
    const rows = await db.$queryRaw<Array<{ total: bigint; critical: bigint }>>(Prisma.sql`
      WITH stock_counts AS (
        SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::int AS current_stock
        FROM stock s
        WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
          AND ${availableStockFilter}
        GROUP BY TRIM(s."StyleNo")
      )
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (
               WHERE COALESCE(sc.current_stock, 0) < (st."MinQuantity" * 0.5)
             )::bigint AS critical
      FROM stock_thresholds st
      LEFT JOIN stock_counts sc ON sc.sn = TRIM(st."StyleNo")
      WHERE st."MinQuantity" > 0
        AND COALESCE(sc.current_stock, 0) < st."MinQuantity"
    `);
    return { total: Number(rows[0]?.total ?? 0), critical: Number(rows[0]?.critical ?? 0) };
  }

  const historyMonths = Math.max(1, await getConfigInt("stock_velocity_history_months"));
  const bufferMonths = Math.max(1, await getConfigInt("stock_velocity_buffer_months"));
  const historyStart = new Date();
  historyStart.setUTCMonth(historyStart.getUTCMonth() - historyMonths);

  const rows = await db.$queryRaw<Array<{ total: bigint; critical: bigint }>>(Prisma.sql`
    WITH stock_counts AS (
      SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::int AS current_stock
      FROM stock s
      WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
        AND ${availableStockFilter}
      GROUP BY TRIM(s."StyleNo")
    ),
    velocity AS (
      SELECT TRIM(sa."StyleNo") AS sn,
             CEIL(COUNT(*)::numeric / ${historyMonths} * ${bufferMonths})::int AS min_qty
      FROM sales sa
      WHERE sa."StyleNo" IS NOT NULL AND TRIM(sa."StyleNo") <> ''
        AND sa."InvoiceDate" >= ${historyStart}
      GROUP BY TRIM(sa."StyleNo")
    )
    SELECT COUNT(*)::bigint AS total,
           COUNT(*) FILTER (
             WHERE COALESCE(sc.current_stock, 0) < (v.min_qty * 0.5)
           )::bigint AS critical
    FROM velocity v
    LEFT JOIN stock_counts sc ON sc.sn = v.sn
    WHERE v.min_qty > 0 AND COALESCE(sc.current_stock, 0) < v.min_qty
  `);
  return { total: Number(rows[0]?.total ?? 0), critical: Number(rows[0]?.critical ?? 0) };
}

async function loadDescriptions(styleNos: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (styleNos.length === 0) return map;
  const placeholders = styleNos.map((s) => Prisma.sql`${s}`);
  const rows = await db.$queryRaw<Array<{ sn: string; desc: string | null }>>(Prisma.sql`
    SELECT DISTINCT ON (TRIM(s."StyleNo"))
      TRIM(s."StyleNo") AS sn,
      s."ProductDescription" AS desc
    FROM stock s
    WHERE TRIM(s."StyleNo") IN (${Prisma.join(placeholders)})
      AND s."ProductDescription" IS NOT NULL
    ORDER BY TRIM(s."StyleNo") ASC, s."UploadedAt" DESC
  `);
  for (const r of rows) {
    if (r.desc?.trim()) map.set(r.sn, r.desc.trim());
  }
  return map;
}

function toSeverity(current: number, min: number): "critical" | "warning" {
  return current < min * 0.5 ? "critical" : "warning";
}

/** Dashboard-only fast restock watchlist (no per-style velocity engine loop). */
export async function getRestockWatchlistFast(limit: number): Promise<{
  items: RestockAlertRow[];
  totalAlerts: number;
  criticalCount: number;
}> {
  const mode = parseMode(await getConfig("stock_threshold_mode"));
  const [alertRows, counts] = await Promise.all([
    queryAlerts(mode, limit),
    countAlerts(mode),
  ]);

  const styleNos = alertRows.map((r) => r.sn);
  const descriptions = await loadDescriptions(styleNos);

  const items: RestockAlertRow[] = alertRows.map((r) => ({
    styleNo: r.sn,
    productDescription: descriptions.get(r.sn) ?? r.sn,
    currentStock: r.current_stock,
    minThreshold: r.min_qty,
    severity: toSeverity(r.current_stock, r.min_qty),
  }));

  return {
    items,
    totalAlerts: counts.total,
    criticalCount: counts.critical,
  };
}

/** Count-only helper for activity card (avoids full replenishment report). */
export async function getRestockAlertCounts(): Promise<{
  totalAlerts: number;
  criticalCount: number;
}> {
  const mode = parseMode(await getConfig("stock_threshold_mode"));
  const counts = await countAlerts(mode);
  return { totalAlerts: counts.total, criticalCount: counts.critical };
}

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getConfig, getConfigBool, getConfigDecimal, getConfigInt } from "@/lib/config";
import {
  classifyAllStyles,
  type StockClass,
  type StyleClassification,
} from "@/lib/stock-classification";

export type { StockClass, StyleClassification };
export { classifyAllStyles };

export type StockReplenishmentMode = "manual" | "velocity" | "global";

export type StockReplenishmentSeverity = "critical" | "warning";

export type StockReplenishmentLine = {
  stockNo: string;
  productDescription: string | null;
  location: string | null;
  boxCode: string | null;
};

export type StockReplenishmentItem = {
  styleNo: string;
  stockClass: StockClass;
  productDescription: string;
  currentStock: number;
  minThreshold: number;
  shortage: number;
  percentageOfMin: number;
  severity: StockReplenishmentSeverity;
  stockItems: StockReplenishmentLine[];
};

export type StockReplenishmentHealthyRow = {
  styleNo: string;
  stockClass: StockClass;
  productDescription: string;
  currentStock: number;
  minThreshold: number;
};

export type StockReplenishmentReport = {
  mode: StockReplenishmentMode;
  config: {
    bufferMonths?: number;
    historyMonths?: number;
    globalValue?: number;
    method1Weight?: number;
    yearsBack?: number;
  };
  items: StockReplenishmentItem[];
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  healthyCount: number;
  /** Sample of healthy styles (capped); use with `healthyCount` for totals. */
  healthySample: StockReplenishmentHealthyRow[];
  checkedAt: string;
};

export type ManualThresholdEditorRow = {
  styleNo: string;
  currentStock: number;
  minQuantity: number;
};

function normalizeStyleNo(s: string): string {
  return s.trim();
}

function parseMode(raw: string): StockReplenishmentMode {
  const m = raw.toLowerCase();
  if (m === "velocity" || m === "global") return m;
  return "manual";
}

/** Available counted stock row: warehouse rules aligned with replenishment calculate route. */
export const availableStockFilter = Prisma.sql`
  s."HoldDate" IS NULL
  AND s."StockNo" NOT IN (SELECT sa."StockNo" FROM sales sa WHERE sa."StockNo" IS NOT NULL)
  AND s."StockNo" NOT IN (
    SELECT ms."StockNo"
    FROM memo_stock ms
    JOIN memo m ON ms."MemoID" = m."MemoID"
    WHERE m."IsActive" = TRUE
      AND ms."StockNo" IS NOT NULL
  )
`;

const HEALTHY_SAMPLE_CAP = 100;

async function loadDescriptionForStyles(styleNos: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (styleNos.length === 0) return map;
  const placeholders = styleNos.map((s) => Prisma.sql`${s}`);
  const rows = await db.$queryRaw<Array<{ sn: string; desc: string | null }>>(
    Prisma.sql`
    SELECT DISTINCT ON (TRIM(s."StyleNo"))
      TRIM(s."StyleNo") AS sn,
      s."ProductDescription" AS desc
    FROM stock s
    WHERE TRIM(s."StyleNo") IN (${Prisma.join(placeholders)})
      AND s."ProductDescription" IS NOT NULL
    ORDER BY TRIM(s."StyleNo") ASC, s."UploadedAt" DESC
  `,
  );
  for (const row of rows) {
    if (row.sn && row.desc?.trim()) map.set(row.sn, row.desc.trim());
  }
  return map;
}

export async function getManualThresholdEditorRows(): Promise<ManualThresholdEditorRow[]> {
  const [universeRows, currentRows, thresholds] = await Promise.all([
    db.$queryRaw<Array<{ sn: string }>>(Prisma.sql`
      SELECT DISTINCT TRIM(x.sn) AS sn FROM (
        SELECT "StyleNo" AS sn FROM stock WHERE "StyleNo" IS NOT NULL AND TRIM("StyleNo") <> ''
        UNION
        SELECT "StyleNo" AS sn FROM sales WHERE "StyleNo" IS NOT NULL AND TRIM("StyleNo") <> ''
        UNION
        SELECT "StyleNo" AS sn FROM stock_thresholds WHERE "StyleNo" IS NOT NULL AND TRIM("StyleNo") <> ''
      ) x
      WHERE TRIM(x.sn) <> ''
      ORDER BY sn ASC
    `),
    db.$queryRaw<Array<{ sn: string; c: bigint }>>(Prisma.sql`
      SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::bigint AS c
      FROM stock s
      WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
        AND ${availableStockFilter}
      GROUP BY TRIM(s."StyleNo")
    `),
    db.stock_thresholds.findMany({ orderBy: { StyleNo: "asc" } }),
  ]);

  const thresholdMap = new Map<string, number>();
  for (const t of thresholds) {
    thresholdMap.set(normalizeStyleNo(t.StyleNo), t.MinQuantity);
  }

  const currentMap = new Map<string, number>();
  for (const row of currentRows) {
    currentMap.set(row.sn, Number(row.c));
  }

  return universeRows.map((row) => {
    const styleNo = row.sn;
    return {
      styleNo,
      currentStock: currentMap.get(styleNo) ?? 0,
      minQuantity: thresholdMap.get(styleNo) ?? 0,
    };
  });
}

export type ThresholdResult = {
  threshold: number;
  method1: number | null;
  method2: number | null;
  stockClass: StockClass;
};

async function recordForecastAccuracy(
  styleNo: string,
  forecastMonth: Date,
  threshold: number,
  method1: number | null,
  method2: number | null,
  stockClass: StockClass,
): Promise<void> {
  const existing = await db.stock_forecast_accuracy.findFirst({
    where: { StyleNo: styleNo, ForecastMonth: forecastMonth },
  });
  const payload = {
    PredictedThreshold: threshold,
    Method1Result: method1 != null ? Math.ceil(method1) : null,
    Method2Result: method2 != null ? Math.ceil(method2) : null,
    StockClass: stockClass,
  };
  if (existing) {
    await db.stock_forecast_accuracy.update({
      where: { AccuracyID: existing.AccuracyID },
      data: payload,
    });
  } else {
    await db.stock_forecast_accuracy.create({
      data: {
        StyleNo: styleNo,
        ForecastMonth: forecastMonth,
        ...payload,
      },
    });
  }
}

/**
 * Calculate minimum threshold for a StyleNo
 * Uses two independent methods then blends them:
 *
 * Method 1 — YoY Same Month:
 *   Actual same-month sales across past X years + trend + CV filter
 *
 * Method 2 — Seasonal Arc:
 *   Historical month-to-month arc projected from current year data
 *   Falls back to Method 1 only if no current year data available
 */
export async function calculateThreshold(
  styleNo: string,
  classification: StyleClassification | undefined,
): Promise<ThresholdResult> {
  const globalMin = await getConfigInt("stock_global_minimum");
  const yearsBack = await getConfigInt("stock_velocity_years_back");
  const bufferEnabled = await getConfigBool("buffer_enabled");
  const cvTrust = await getConfigDecimal("stock_cv_trust_threshold");
  const cvDampen = await getConfigDecimal("stock_cv_dampen_threshold");
  const m1Weight = await getConfigInt("stock_method1_weight");
  const gapWarning = await getConfigInt("stock_confidence_gap_warning");
  const windowEnabled = await getConfigBool("stock_window_enabled");
  const windowSize = await getConfigInt("stock_window_size");
  const windowDir = await getConfig("stock_window_direction");
  const weightEnabled = await getConfigBool("stock_window_weight_enabled");
  const weightMode = await getConfig("stock_window_weight_mode");
  const weightCurrent = await getConfigInt("stock_window_weight_current");

  const stockClass = classification?.stockClass ?? "C";

  if (stockClass === "S") {
    const sFixedMin = await getConfigInt("sclass_fixed_min_stock");
    return { threshold: Math.max(sFixedMin, globalMin), method1: null, method2: null, stockClass };
  }

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const sameMonthlySales: number[] = [];
  for (let y = 1; y <= yearsBack; y++) {
    const year = currentYear - y;
    const start = new Date(year, currentMonth - 1, 1);
    const end = new Date(year, currentMonth, 0);
    const count = await db.sales.count({
      where: { StyleNo: styleNo, InvoiceDate: { gte: start, lte: end } },
    });
    if (count > 0) sameMonthlySales.push(count);
  }

  let method1: number | null = null;
  if (sameMonthlySales.length > 0) {
    const baseAvg = sameMonthlySales.reduce((a, b) => a + b, 0) / sameMonthlySales.length;
    const mean = baseAvg;
    const stdDev = Math.sqrt(
      sameMonthlySales.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sameMonthlySales.length,
    );
    const cv = mean > 0 ? stdDev / mean : 1;

    let trendMultiplier = 1.0;
    if (sameMonthlySales.length >= 2) {
      const growthRates: number[] = [];
      for (let i = 1; i < sameMonthlySales.length; i++) {
        const prev = sameMonthlySales[i];
        const curr = sameMonthlySales[i - 1];
        if (prev > 0) growthRates.push(((curr - prev) / prev) * 100);
      }
      if (growthRates.length > 0) {
        const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
        if (cv < cvTrust) {
          trendMultiplier = 1 + avgGrowth / 100;
        } else if (cv < cvDampen) {
          trendMultiplier = 1 + (avgGrowth / 100) * 0.5;
        } else {
          trendMultiplier = 1.0;
        }
      }
    }
    method1 = baseAvg * trendMultiplier;
  }

  let method2: number | null = null;
  if (windowEnabled && windowSize > 1) {
    const offsets: number[] = [];
    for (let i = 0; i < windowSize; i++) {
      offsets.push(windowDir === "forward" ? i : -i);
    }

    const weights: number[] = [];
    if (weightEnabled) {
      if (weightMode === "auto") {
        const remainingWeight = 100 - weightCurrent;
        const otherMonthWeight = windowSize > 1 ? remainingWeight / (windowSize - 1) : 0;
        weights.push(weightCurrent / 100);
        for (let i = 1; i < windowSize; i++) weights.push(otherMonthWeight / 100);
      } else {
        const manualWeights = await getConfig("stock_window_weights_manual");
        const parsed = JSON.parse(manualWeights || "{}") as Record<string, number>;
        for (let i = 0; i < windowSize; i++) {
          weights.push((parsed[String(offsets[i])] ?? 100 / windowSize) / 100);
        }
      }
    } else {
      for (let i = 0; i < windowSize; i++) weights.push(1 / windowSize);
    }

    void weights;

    const arcSteps: number[][] = Array.from({ length: windowSize - 1 }, () => []);

    for (let y = 1; y <= yearsBack; y++) {
      const year = currentYear - y;
      const monthlySales: (number | null)[] = [];

      for (const offset of offsets) {
        const targetMonth = currentMonth + offset;
        const targetDate = new Date(year, targetMonth - 1, 1);
        const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
        const count = await db.sales.count({
          where: { StyleNo: styleNo, InvoiceDate: { gte: start, lte: end } },
        });
        monthlySales.push(count > 0 ? count : null);
      }

      const allPresent = monthlySales.every((v) => v !== null);
      if (allPresent) {
        for (let s = 0; s < windowSize - 1; s++) {
          const from = monthlySales[s]!;
          const to = monthlySales[s + 1]!;
          if (from > 0) arcSteps[s].push(((to - from) / from) * 100);
        }
      }
    }

    const avgArc: number[] = arcSteps.map((steps) =>
      steps.length > 0 ? steps.reduce((a, b) => a + b, 0) / steps.length : 0,
    );

    let anchorValue: number | null = null;
    let anchorOffsetIndex = -1;

    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      const targetMonth = currentMonth + offset;
      const targetDate = new Date(currentYear, targetMonth - 1, 1);
      const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

      if (start > new Date()) continue;

      const count = await db.sales.count({
        where: { StyleNo: styleNo, InvoiceDate: { gte: start, lte: end } },
      });
      if (count > 0) {
        anchorValue = count;
        anchorOffsetIndex = i;
        break;
      }
    }

    if (anchorValue !== null && anchorOffsetIndex >= 0) {
      let projected = anchorValue;
      for (let s = anchorOffsetIndex - 1; s >= 0; s--) {
        projected = projected * (1 + avgArc[s] / 100);
      }
      method2 = projected;
    }
  }

  let blended: number;
  if (method1 !== null && method2 !== null) {
    const m2Weight = 100 - m1Weight;
    blended = method1 * (m1Weight / 100) + method2 * (m2Weight / 100);
    const gap = (Math.abs(method1 - method2) / Math.max(method1, method2)) * 100;
    if (gap > gapWarning) {
      console.warn(
        `[StockThreshold] ${styleNo}: Method1=${method1.toFixed(1)} vs Method2=${method2.toFixed(1)} — gap ${gap.toFixed(1)}% exceeds ${gapWarning}% warning threshold`,
      );
    }
  } else if (method1 !== null) {
    blended = method1;
  } else if (method2 !== null) {
    blended = method2;
  } else {
    return { threshold: globalMin, method1: null, method2: null, stockClass };
  }

  let finalThreshold = blended;
  if (bufferEnabled) {
    const classKey = stockClass.toLowerCase();
    const classBufferEnabled = await getConfigBool(`buffer_${classKey}_enabled`);
    const classBufferMultiplier = await getConfigDecimal(`buffer_${classKey}_multiplier`);
    if (classBufferEnabled) {
      finalThreshold = blended * classBufferMultiplier;
    }
  }

  const threshold = Math.max(Math.ceil(finalThreshold), globalMin);

  const feedbackEnabled = await getConfigBool("stock_feedback_enabled");
  if (feedbackEnabled) {
    const forecastMonth = new Date(currentYear, currentMonth - 1, 1);
    await recordForecastAccuracy(styleNo, forecastMonth, threshold, method1, method2, stockClass);
  }

  return { threshold, method1, method2, stockClass };
}

export async function getStockReplenishmentReport(): Promise<StockReplenishmentReport> {
  const checkedAt = new Date().toISOString();
  const mode = parseMode(await getConfig("stock_threshold_mode"));
  const globalValue = await getConfigInt("stock_threshold_global_value");
  const method1Weight = await getConfigInt("stock_method1_weight");
  const yearsBack = await getConfigInt("stock_velocity_years_back");

  const classifications = await classifyAllStyles();

  const [universeRows, currentRows, thresholds] = await Promise.all([
    db.$queryRaw<Array<{ sn: string }>>(Prisma.sql`
      SELECT DISTINCT TRIM(x.sn) AS sn FROM (
        SELECT "StyleNo" AS sn FROM stock WHERE "StyleNo" IS NOT NULL AND TRIM("StyleNo") <> ''
        UNION
        SELECT "StyleNo" AS sn FROM sales WHERE "StyleNo" IS NOT NULL AND TRIM("StyleNo") <> ''
        UNION
        SELECT "StyleNo" AS sn FROM stock_thresholds WHERE "StyleNo" IS NOT NULL AND TRIM("StyleNo") <> ''
      ) x
      WHERE TRIM(x.sn) <> ''
    `),
    db.$queryRaw<Array<{ sn: string; c: bigint }>>(Prisma.sql`
      SELECT TRIM(s."StyleNo") AS sn, COUNT(*)::bigint AS c
      FROM stock s
      WHERE s."StyleNo" IS NOT NULL AND TRIM(s."StyleNo") <> ''
        AND ${availableStockFilter}
      GROUP BY TRIM(s."StyleNo")
    `),
    db.stock_thresholds.findMany(),
  ]);

  const thresholdMap = new Map<string, number>();
  for (const t of thresholds) {
    thresholdMap.set(normalizeStyleNo(t.StyleNo), t.MinQuantity);
  }

  const currentMap = new Map<string, number>();
  for (const row of currentRows) {
    currentMap.set(row.sn, Number(row.c));
  }

  type Draft = {
    styleNo: string;
    stockClass: StockClass;
    currentStock: number;
    minThreshold: number;
    shortage: number;
    percentageOfMin: number;
    severity: StockReplenishmentSeverity;
  };

  const drafts: Draft[] = [];
  const healthySample: StockReplenishmentHealthyRow[] = [];
  let healthyCount = 0;

  for (const row of universeRows) {
    const styleNo = row.sn;
    if (!styleNo) continue;

    const classification = classifications.get(styleNo);
    const stockClass: StockClass = classification?.stockClass ?? "C";

    let minQty: number;
    if (mode === "manual") {
      minQty = thresholdMap.get(styleNo) ?? 0;
    } else if (mode === "global") {
      minQty = globalValue;
    } else {
      const { threshold } = await calculateThreshold(styleNo, classification);
      minQty = threshold;
    }

    if (minQty <= 0) continue;

    const currentStock = currentMap.get(styleNo) ?? 0;
    if (currentStock >= minQty) {
      healthyCount += 1;
      if (healthySample.length < HEALTHY_SAMPLE_CAP) {
        healthySample.push({
          styleNo,
          stockClass,
          productDescription: "",
          currentStock,
          minThreshold: minQty,
        });
      }
      continue;
    }

    const shortage = minQty - currentStock;
    const severity: StockReplenishmentSeverity =
      currentStock < minQty * 0.5 ? "critical" : "warning";
    const percentageOfMin = minQty > 0 ? Math.round((currentStock / minQty) * 100) : 0;

    drafts.push({
      styleNo,
      stockClass,
      currentStock,
      minThreshold: minQty,
      shortage,
      percentageOfMin,
      severity,
    });
  }

  drafts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.shortage - a.shortage;
  });

  const healthyStyleNos = healthySample.map((h) => h.styleNo);
  const healthyDesc = await loadDescriptionForStyles(healthyStyleNos);
  for (const h of healthySample) {
    h.productDescription = healthyDesc.get(h.styleNo) ?? "";
  }

  const styleNos = drafts.map((d) => d.styleNo);
  const [linesByStyle, descByStyle] = await Promise.all([
    loadStockLinesForStyles(styleNos),
    loadDescriptionForStyles(styleNos),
  ]);

  const items: StockReplenishmentItem[] = drafts.map((d) => {
    const stockItems = linesByStyle.get(d.styleNo) ?? [];
    const fromLines = stockItems.find((x) => x.productDescription?.trim())?.productDescription?.trim();
    const productDescription = fromLines ?? descByStyle.get(d.styleNo) ?? "";
    return {
      styleNo: d.styleNo,
      stockClass: d.stockClass,
      productDescription,
      currentStock: d.currentStock,
      minThreshold: d.minThreshold,
      shortage: d.shortage,
      percentageOfMin: d.percentageOfMin,
      severity: d.severity,
      stockItems,
    };
  });

  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const warningCount = items.filter((i) => i.severity === "warning").length;

  const configOut: StockReplenishmentReport["config"] = {};
  if (mode === "velocity") {
    configOut.method1Weight = method1Weight;
    configOut.yearsBack = yearsBack;
  }
  if (mode === "global") {
    configOut.globalValue = globalValue;
  }

  return {
    mode,
    config: configOut,
    items,
    totalAlerts: items.length,
    criticalCount,
    warningCount,
    healthyCount,
    healthySample,
    checkedAt,
  };
}

async function loadStockLinesForStyles(
  styleNos: string[],
): Promise<Map<string, StockReplenishmentLine[]>> {
  const map = new Map<string, StockReplenishmentLine[]>();
  if (styleNos.length === 0) return map;

  const placeholders = styleNos.map((s) => Prisma.sql`${s}`);

  const rows = await db.$queryRaw<
    Array<{
      sn: string;
      StockNo: string;
      ProductDescription: string | null;
      Location: string | null;
      BoxCode: string | null;
    }>
  >(Prisma.sql`
    SELECT TRIM(s."StyleNo") AS sn,
      s."StockNo",
      s."ProductDescription",
      s."Location",
      s."BoxCode"
    FROM stock s
    WHERE TRIM(s."StyleNo") IN (${Prisma.join(placeholders)})
      AND ${availableStockFilter}
    ORDER BY TRIM(s."StyleNo") ASC, s."StockNo" ASC
  `);

  for (const row of rows) {
    const line: StockReplenishmentLine = {
      stockNo: row.StockNo,
      productDescription: row.ProductDescription,
      location: row.Location,
      boxCode: row.BoxCode,
    };
    const list = map.get(row.sn) ?? [];
    list.push(line);
    map.set(row.sn, list);
  }

  return map;
}

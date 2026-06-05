import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getConfig, getConfigBool, getConfigDecimal } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

type RankingPeriod = "all_time" | "yearly" | "monthly";
type ValueMetric = "SaleValue" | "Profit";

// Raw query result shape — pg driver returns COUNT/RANK as bigint (string in JS),
// SUM of numeric columns as string for precision.
type OverallRawRow = {
  ClientID: string;
  TotalPiecesSold: bigint;
  TotalValueSold: string;
  TotalProfit: string;
  CombinedScore: string;
  OverallRank: bigint;
};

type StyleRawRow = {
  ClientID: string;
  StyleNo: string;
  TotalPiecesSold: bigint;
  TotalValueSold: string;
  TotalProfit: string;
  CombinedScore: string;
  StyleRank: bigint;
};

type ClientStyleRawRow = {
  ClientID: string;
  StyleNo: string;
  TotalPiecesSold: bigint;
  TotalValueSold: string;
  TotalProfit: string;
  CombinedScore: string;
  ClientStyleRank: bigint;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(period: RankingPeriod): { from: Date; to: Date } | null {
  if (period === "all_time") return null;

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (period === "yearly") {
    return {
      from: new Date(Date.UTC(y, 0, 1)),
      to: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
    };
  }

  // monthly — last day of month via day-0 trick
  return {
    from: new Date(Date.UTC(y, m, 1)),
    to: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
  };
}

function normalizeStyleNo(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

async function buildRankingScoreExpr(): Promise<Prisma.Sql> {
  const [valueMetricRaw, useCombinedScore, valueWeight, volumeWeight] = await Promise.all([
    getConfig("ranking_value_metric"),
    getConfigBool("use_combined_score"),
    getConfigDecimal("ranking_value_weight"),
    getConfigDecimal("ranking_volume_weight"),
  ]);
  const valueMetric = valueMetricRaw as ValueMetric;

  return useCombinedScore
    ? valueMetric === "Profit"
      ? Prisma.sql`("TotalProfit" * ${valueWeight} + "TotalPiecesSold"::numeric * ${volumeWeight})`
      : Prisma.sql`("TotalValueSold" * ${valueWeight} + "TotalPiecesSold"::numeric * ${volumeWeight})`
    : valueMetric === "Profit"
      ? Prisma.sql`"TotalProfit"`
      : Prisma.sql`"TotalValueSold"`;
}

type StyleRankLookupRow = {
  StyleNo: string;
  StyleRank: bigint;
};

/** All-time style rank for specific StyleNos when cache rows are missing. */
async function queryLiveStyleRanks(
  clientId: string,
  styleNos: string[],
): Promise<Map<string, number>> {
  if (styleNos.length === 0) return new Map();

  const scoreExpr = await buildRankingScoreExpr();
  const styleNoList = Prisma.join(styleNos.map((sn) => Prisma.sql`${sn}`));

  const rows = await db.$queryRaw<StyleRankLookupRow[]>(Prisma.sql`
    WITH style_sales AS (
      SELECT
        c."ClientID",
        TRIM(COALESCE(s."StyleNo", st."StyleNo")) AS "StyleNo",
        COUNT(s."SalesID") AS "TotalPiecesSold",
        COALESCE(SUM(s."SaleValue"), 0) AS "TotalValueSold",
        COALESCE(SUM(COALESCE(s."SaleValue", 0) - COALESCE(s."CRAmount", 0)), 0) AS "TotalProfit"
      FROM sales s
      INNER JOIN clients c ON (
        (s."PartyCode" IS NOT NULL AND c."PartyCode" = s."PartyCode") OR
        (s."PartyCode" IS NULL AND c."PartyName" = s."PartyName")
      )
      LEFT JOIN stock st ON st."StockNo" = s."StockNo"
      WHERE TRIM(COALESCE(s."StyleNo", st."StyleNo")) IN (${styleNoList})
      GROUP BY c."ClientID", TRIM(COALESCE(s."StyleNo", st."StyleNo"))
    ),
    style_scored AS (
      SELECT
        "ClientID",
        "StyleNo",
        "TotalPiecesSold",
        "TotalValueSold",
        "TotalProfit",
        ${scoreExpr} AS "CombinedScore"
      FROM style_sales
    ),
    ranked AS (
      SELECT
        "ClientID",
        "StyleNo",
        RANK() OVER (PARTITION BY "StyleNo" ORDER BY "CombinedScore" DESC) AS "StyleRank"
      FROM style_scored
    )
    SELECT "StyleNo", "StyleRank"
    FROM ranked
    WHERE "ClientID" = ${clientId}::uuid
  `);

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeStyleNo(row.StyleNo);
    if (key) map.set(key, Number(row.StyleRank));
  }
  return map;
}

/**
 * Style rank lookup for client replenishment.
 * Uses cached `customer_rankings` first; fills gaps with live all-time ranks.
 */
export async function getStyleRankMapForClient(
  clientId: string,
  styleNos: string[],
): Promise<Map<string, number>> {
  const unique = [
    ...new Set(
      styleNos
        .map((sn) => normalizeStyleNo(sn))
        .filter((sn): sn is string => Boolean(sn)),
    ),
  ];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const cached = await db.customer_rankings.findMany({
    where: { ClientID: clientId, StyleNo: { in: unique } },
    select: { StyleNo: true, StyleRank: true },
  });

  const missing: string[] = [];
  for (const sn of unique) {
    const hit = cached.find((row) => normalizeStyleNo(row.StyleNo) === sn);
    if (hit?.StyleRank != null) {
      map.set(sn, hit.StyleRank);
    } else {
      missing.push(sn);
    }
  }

  if (missing.length > 0) {
    const live = await queryLiveStyleRanks(clientId, missing);
    for (const [styleNo, rank] of live) {
      map.set(styleNo, rank);
    }
  }

  return map;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Recalculate all customer rankings from the current sales data.
 *
 * Overall rank (OverallRank, OverallScore, LastRankedAt) is written directly
 * to the clients table.  Per-StyleNo ranks (StyleRank) are upserted into
 * customer_rankings.  No NULL-StyleNo rows are written to customer_rankings.
 */
export async function recalculateRankings(): Promise<void> {
  // ── 1. Read config ─────────────────────────────────────────────────────────
  const periodRaw = await getConfig("ranking_period");
  const period = periodRaw as RankingPeriod;

  // ── 2. Resolve date filter and scoring expression ───────────────────────────
  const dateRange = getDateRange(period);
  const dateFilter: Prisma.Sql = dateRange
    ? Prisma.sql`AND s."InvoiceDate" >= ${dateRange.from} AND s."InvoiceDate" <= ${dateRange.to}`
    : Prisma.sql``;

  const scoreExpr = await buildRankingScoreExpr();

  const now = new Date();

  // ── 3. Remove stale overall rows (now redundant — rank lives on clients) ────
  await db.$executeRaw(Prisma.sql`DELETE FROM customer_rankings WHERE "StyleNo" IS NULL`);

  // ── 4. Overall rankings — written to clients table ────────────────────────
  //
  // Join logic: prefer PartyCode match; fall back to PartyName.
  const overallRows = await db.$queryRaw<OverallRawRow[]>(Prisma.sql`
    WITH client_sales AS (
      SELECT
        c."ClientID",
        COUNT(s."SalesID")                                                          AS "TotalPiecesSold",
        COALESCE(SUM(s."SaleValue"), 0)                                             AS "TotalValueSold",
        COALESCE(SUM(COALESCE(s."SaleValue", 0) - COALESCE(s."CRAmount", 0)), 0)   AS "TotalProfit"
      FROM sales s
      INNER JOIN clients c ON (
        (s."PartyCode" IS NOT NULL AND c."PartyCode" = s."PartyCode") OR
        (s."PartyCode" IS NULL     AND c."PartyName" = s."PartyName")
      )
      WHERE TRUE ${dateFilter}
      GROUP BY c."ClientID"
    ),
    scored AS (
      SELECT
        "ClientID",
        "TotalPiecesSold",
        "TotalValueSold",
        "TotalProfit",
        ${scoreExpr} AS "CombinedScore"
      FROM client_sales
    )
    SELECT
      "ClientID",
      "TotalPiecesSold",
      "TotalValueSold",
      "TotalProfit",
      "CombinedScore",
      RANK() OVER (ORDER BY "CombinedScore" DESC) AS "OverallRank"
    FROM scored
  `);

  for (const row of overallRows) {
    const score = parseFloat(row.CombinedScore);
    const overallRank = Number(row.OverallRank);

    await db.$executeRaw(Prisma.sql`
      UPDATE clients SET
        "OverallRank"  = ${overallRank},
        "OverallScore" = ${score},
        "LastRankedAt" = ${now}
      WHERE "ClientID" = ${row.ClientID}::uuid
    `);
  }

  // ── 5. Per-StyleNo rankings — upserted into customer_rankings ───────────────
  const styleRows = await db.$queryRaw<StyleRawRow[]>(Prisma.sql`
    WITH style_sales AS (
      SELECT
        c."ClientID",
        COALESCE(s."StyleNo", st."StyleNo")                                         AS "StyleNo",
        COUNT(s."SalesID")                                                          AS "TotalPiecesSold",
        COALESCE(SUM(s."SaleValue"), 0)                                             AS "TotalValueSold",
        COALESCE(SUM(COALESCE(s."SaleValue", 0) - COALESCE(s."CRAmount", 0)), 0)   AS "TotalProfit"
      FROM sales s
      INNER JOIN clients c ON (
        (s."PartyCode" IS NOT NULL AND c."PartyCode" = s."PartyCode") OR
        (s."PartyCode" IS NULL     AND c."PartyName" = s."PartyName")
      )
      LEFT JOIN stock st ON st."StockNo" = s."StockNo"
      WHERE COALESCE(s."StyleNo", st."StyleNo") IS NOT NULL ${dateFilter}
      GROUP BY c."ClientID", COALESCE(s."StyleNo", st."StyleNo")
    ),
    style_scored AS (
      SELECT
        "ClientID",
        "StyleNo",
        "TotalPiecesSold",
        "TotalValueSold",
        "TotalProfit",
        ${scoreExpr} AS "CombinedScore"
      FROM style_sales
    )
    SELECT
      "ClientID",
      "StyleNo",
      "TotalPiecesSold",
      "TotalValueSold",
      "TotalProfit",
      "CombinedScore",
      RANK() OVER (PARTITION BY "StyleNo" ORDER BY "CombinedScore" DESC) AS "StyleRank"
    FROM style_scored
  `);

  for (const row of styleRows) {
    if (!row.StyleNo) continue;

    const piecesSold = Number(row.TotalPiecesSold);
    const valueSold = parseFloat(row.TotalValueSold);
    const profit = parseFloat(row.TotalProfit);
    const score = parseFloat(row.CombinedScore);
    const styleRank = Number(row.StyleRank);

    await db.$executeRaw(Prisma.sql`
      INSERT INTO customer_rankings
        ("ClientID", "StyleNo", "TotalPiecesSold", "TotalValueSold", "TotalProfit", "CombinedScore", "StyleRank", "LastCalculatedAt")
      VALUES
        (${row.ClientID}::uuid, ${row.StyleNo}, ${piecesSold}, ${valueSold}, ${profit}, ${score}, ${styleRank}, ${now})
      ON CONFLICT ("ClientID", "StyleNo") WHERE "StyleNo" IS NOT NULL
      DO UPDATE SET
        "TotalPiecesSold"   = EXCLUDED."TotalPiecesSold",
        "TotalValueSold"    = EXCLUDED."TotalValueSold",
        "TotalProfit"       = EXCLUDED."TotalProfit",
        "CombinedScore"     = EXCLUDED."CombinedScore",
        "StyleRank"         = EXCLUDED."StyleRank",
        "LastCalculatedAt"  = EXCLUDED."LastCalculatedAt"
    `);
  }

  // ── 6. Per-client style rankings — upserted into client_style_rankings ─────
  // Same (ClientID, StyleNo) aggregates as step 5, but rank is private per client:
  // RANK() OVER (PARTITION BY ClientID ORDER BY CombinedScore DESC)
  const clientStyleRows = await db.$queryRaw<ClientStyleRawRow[]>(Prisma.sql`
    WITH style_sales AS (
      SELECT
        c."ClientID",
        COALESCE(s."StyleNo", st."StyleNo")                                         AS "StyleNo",
        COUNT(s."SalesID")                                                          AS "TotalPiecesSold",
        COALESCE(SUM(s."SaleValue"), 0)                                             AS "TotalValueSold",
        COALESCE(SUM(COALESCE(s."SaleValue", 0) - COALESCE(s."CRAmount", 0)), 0)   AS "TotalProfit"
      FROM sales s
      INNER JOIN clients c ON (
        (s."PartyCode" IS NOT NULL AND c."PartyCode" = s."PartyCode") OR
        (s."PartyCode" IS NULL     AND c."PartyName" = s."PartyName")
      )
      LEFT JOIN stock st ON st."StockNo" = s."StockNo"
      WHERE COALESCE(s."StyleNo", st."StyleNo") IS NOT NULL ${dateFilter}
      GROUP BY c."ClientID", COALESCE(s."StyleNo", st."StyleNo")
    ),
    style_scored AS (
      SELECT
        "ClientID",
        "StyleNo",
        "TotalPiecesSold",
        "TotalValueSold",
        "TotalProfit",
        ${scoreExpr} AS "CombinedScore"
      FROM style_sales
    )
    SELECT
      "ClientID",
      "StyleNo",
      "TotalPiecesSold",
      "TotalValueSold",
      "TotalProfit",
      "CombinedScore",
      RANK() OVER (PARTITION BY "ClientID" ORDER BY "CombinedScore" DESC) AS "ClientStyleRank"
    FROM style_scored
  `);

  for (const row of clientStyleRows) {
    if (!row.StyleNo) continue;

    const piecesSold = Number(row.TotalPiecesSold);
    const valueSold = parseFloat(row.TotalValueSold);
    const profit = parseFloat(row.TotalProfit);
    const score = parseFloat(row.CombinedScore);
    const clientStyleRank = Number(row.ClientStyleRank);

    await db.$executeRaw(Prisma.sql`
      INSERT INTO client_style_rankings
        ("ClientID", "StyleNo", "TotalPiecesSold", "TotalValueSold", "TotalProfit", "CombinedScore", "ClientStyleRank", "LastCalculatedAt")
      VALUES
        (${row.ClientID}::uuid, ${row.StyleNo}, ${piecesSold}, ${valueSold}, ${profit}, ${score}, ${clientStyleRank}, ${now})
      ON CONFLICT ("ClientID", "StyleNo")
      DO UPDATE SET
        "TotalPiecesSold"   = EXCLUDED."TotalPiecesSold",
        "TotalValueSold"    = EXCLUDED."TotalValueSold",
        "TotalProfit"       = EXCLUDED."TotalProfit",
        "CombinedScore"     = EXCLUDED."CombinedScore",
        "ClientStyleRank"   = EXCLUDED."ClientStyleRank",
        "LastCalculatedAt"  = EXCLUDED."LastCalculatedAt"
    `);
  }

  // ── 7. Record timestamp of this recalculation ──────────────────────────────
  await db.system_config.upsert({
    where: { ConfigKey: "ranking_last_calculated" },
    update: { ConfigValue: now.toISOString(), UpdatedAt: now },
    create: {
      ConfigKey: "ranking_last_calculated",
      ConfigValue: now.toISOString(),
      ConfigType: "string",
      Module: "ranking",
      Description: "ISO timestamp of the most recent ranking recalculation",
    },
  });
}

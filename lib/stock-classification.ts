/**
 * Classifies each StyleNo into S / A / B / C class
 * based on avg revenue per piece and annual revenue contribution
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getConfigDecimal, getConfigInt } from "@/lib/config";

export type StockClass = "S" | "A" | "B" | "C";

export interface StyleClassification {
  styleNo: string;
  stockClass: StockClass;
  avgRevenuePerPiece: number;
  annualRevenue: number;
  annualPieces: number;
}

type SalesByStyleRow = {
  StyleNo: string;
  totalRevenue: string | number | null;
  totalPieces: bigint | number;
  avgRevenuePerPiece: string | number | null;
};

function toNumber(value: string | number | bigint | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function classifyAllStyles(): Promise<Map<string, StyleClassification>> {
  const sClassMinRevenue = await getConfigDecimal("sclass_min_revenue_per_piece");
  const aClassPct = await getConfigInt("abc_a_class_pct");
  const bClassPct = await getConfigInt("abc_b_class_pct");

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);

  const salesByStyle = await db.$queryRaw<SalesByStyleRow[]>(Prisma.sql`
    SELECT
      "StyleNo",
      SUM("SaleValue") AS "totalRevenue",
      COUNT(*) AS "totalPieces",
      AVG("SaleValue") AS "avgRevenuePerPiece"
    FROM sales
    WHERE "StyleNo" IS NOT NULL
      AND "SaleValue" IS NOT NULL
      AND "InvoiceDate" >= ${yearStart}
    GROUP BY "StyleNo"
    ORDER BY SUM("SaleValue") DESC
  `);

  const totalStyles = salesByStyle.length;
  const aCount = Math.ceil((totalStyles * aClassPct) / 100);
  const bCount = Math.ceil((totalStyles * bClassPct) / 100);

  const result = new Map<string, StyleClassification>();

  salesByStyle.forEach((row, index) => {
    const avgRevenuePerPiece = toNumber(row.avgRevenuePerPiece);
    let stockClass: StockClass;

    if (avgRevenuePerPiece >= sClassMinRevenue) {
      stockClass = "S";
    } else if (index < aCount) {
      stockClass = "A";
    } else if (index < aCount + bCount) {
      stockClass = "B";
    } else {
      stockClass = "C";
    }

    result.set(row.StyleNo, {
      styleNo: row.StyleNo,
      stockClass,
      avgRevenuePerPiece,
      annualRevenue: toNumber(row.totalRevenue),
      annualPieces: toNumber(row.totalPieces),
    });
  });

  return result;
}

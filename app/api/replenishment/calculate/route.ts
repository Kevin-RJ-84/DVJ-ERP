import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { InStockItem, PullbackItem, ReplenishmentFilters } from "@/lib/replenishment";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const payloadSchema = z.object({
  requiredQty: z.number().int().min(1),
  filters: z.object({
    styleNo: z.string().trim().optional(),
    stoneShape: z.string().trim().optional(),
    metal: z.string().trim().optional(),
    metalType: z.string().trim().optional(),
    productType: z.string().trim().optional(),
    productStyle: z.string().trim().optional(),
  }),
});

function buildFilterSql(filters: ReplenishmentFilters) {
  const clauses: Prisma.Sql[] = [];

  if (filters.styleNo) clauses.push(Prisma.sql`s."StyleNo" = ${filters.styleNo}`);
  if (filters.stoneShape) clauses.push(Prisma.sql`s."StoneShape" = ${filters.stoneShape}`);
  if (filters.metal) clauses.push(Prisma.sql`s."Metal" = ${filters.metal}`);
  if (filters.metalType) clauses.push(Prisma.sql`s."MetalType" = ${filters.metalType}`);
  if (filters.productType) clauses.push(Prisma.sql`s."ProductType" = ${filters.productType}`);
  if (filters.productStyle) clauses.push(Prisma.sql`s."ProductStyle" = ${filters.productStyle}`);

  if (clauses.length === 0) {
    return Prisma.sql`TRUE`;
  }

  return Prisma.join(clauses, " AND ");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.search");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const filters = parsed.data.filters;
  const requiredQty = parsed.data.requiredQty;
  const filterSql = buildFilterSql(filters);

  const inStockItems = await db.$queryRaw<InStockItem[]>(Prisma.sql`
    SELECT s."StockNo", s."StockType", s."Location"
    FROM stock s
    WHERE ${filterSql}
      AND s."HoldDate" IS NULL
      AND s."StockNo" NOT IN (SELECT sa."StockNo" FROM sales sa WHERE sa."StockNo" IS NOT NULL)
      AND s."StockNo" NOT IN (
        SELECT ms."StockNo"
        FROM memo_stock ms
        JOIN memo m ON ms."MemoID" = m."MemoID"
        WHERE m."IsActive" = TRUE
          AND ms."StockNo" IS NOT NULL
      )
    ORDER BY s."StockNo" ASC
  `);

  const pullbackItems = await db.$queryRaw<PullbackItem[]>(Prisma.sql`
    SELECT s."StockNo", c."PartyName", m."MemoNo", m."MemoEndDate"
    FROM stock s
    JOIN memo_stock ms ON s."StockNo" = ms."StockNo"
    JOIN memo m ON ms."MemoID" = m."MemoID"
    JOIN clients c ON m."ClientID" = c."ClientID"
    WHERE ${filterSql}
      AND m."IsActive" = TRUE
      AND c."IsStockPullAllowed" = TRUE
      AND m."MemoEndDate" <= (CURRENT_DATE + (c."CloseToExpiryDays" * INTERVAL '1 day'))
    ORDER BY m."MemoEndDate" ASC, s."StockNo" ASC
  `);

  const inStockCount = inStockItems.length;
  const pullbackCount = pullbackItems.length;
  const factoryOrderCount = Math.max(0, requiredQty - inStockCount - pullbackCount);

  return NextResponse.json({
    metrics: {
      inStockCount,
      pullbackCount,
      factoryOrderCount,
      requiredQty,
    },
    lists: {
      inStockItems,
      pullbackItems,
    },
  });
}

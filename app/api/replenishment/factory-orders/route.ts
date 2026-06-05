import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { resolveClientInvoiceNos } from "@/lib/replenishment-pending-invoices";
import {
  daysSinceDate,
  FACTORY_ORDER_STATUSES,
  userDisplayName,
} from "@/lib/replenishment-item-status";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") ?? undefined;
  const styleNo = searchParams.get("styleNo")?.trim() ?? undefined;
  const status = searchParams.get("status")?.trim() ?? undefined;
  const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
  const skip = (page - 1) * limit;

  const where: Prisma.replenishment_itemsWhereInput = {
    IsActive: true,
    Replenishment: { IsUndone: false },
    Status: status
      ? status
      : { in: [...FACTORY_ORDER_STATUSES] },
  };

  if (styleNo) {
    where.StyleNo = { contains: styleNo, mode: "insensitive" };
  }

  if (clientId) {
    const invoiceNos = await resolveClientInvoiceNos(clientId);
    if (invoiceNos === null) {
      return NextResponse.json({ message: "Client not found." }, { status: 404 });
    }
    if (invoiceNos.length === 0) {
      return NextResponse.json({ total: 0, page, limit, items: [] });
    }
    where.InvoiceNo = { in: invoiceNos };
  }

  const [total, rows] = await db.$transaction([
    db.replenishment_items.count({ where }),
    db.replenishment_items.findMany({
      where,
      skip,
      take: limit,
      orderBy: { CreatedAt: "desc" },
      include: {
        Replenishment: {
          select: { ReplenishedAt: true },
        },
      },
    }),
  ]);

  const stockNos = [...new Set(rows.map((r) => r.StockNo).filter((sn) => sn && sn !== "—"))];
  const stockByNo = new Map<
    string,
    {
      ProductDescription: string | null;
      MetalType: string | null;
      MetalPurity: string | null;
      StoneShape: string | null;
      ProductType: string | null;
    }
  >();
  if (stockNos.length > 0) {
    const stockRows = await db.stock.findMany({
      where: { StockNo: { in: stockNos } },
      select: {
        StockNo: true,
        ProductDescription: true,
        MetalType: true,
        MetalPurity: true,
        StoneShape: true,
        ProductType: true,
      },
    });
    for (const s of stockRows) stockByNo.set(s.StockNo, s);
  }

  const invoiceNos = [...new Set(rows.map((r) => r.InvoiceNo))];
  const partyByInvoice = new Map<string, string>();
  if (invoiceNos.length > 0) {
    const salesRows = await db.sales.findMany({
      where: { InvoiceNo: { in: invoiceNos } },
      select: { InvoiceNo: true, PartyName: true },
      distinct: ["InvoiceNo", "PartyName"],
    });
    for (const s of salesRows) {
      if (!partyByInvoice.has(s.InvoiceNo) && s.PartyName?.trim()) {
        partyByInvoice.set(s.InvoiceNo, s.PartyName.trim());
      }
    }
  }

  const placedByIds = [
    ...new Set(rows.map((r) => r.FactoryOrderPlacedBy).filter((id): id is string => Boolean(id))),
  ];
  const placedByName = new Map<string, string>();
  if (placedByIds.length > 0) {
    const users = await db.users.findMany({
      where: { UserID: { in: placedByIds } },
      select: { UserID: true, FirstName: true, LastName: true, Email: true },
    });
    for (const u of users) placedByName.set(u.UserID, userDisplayName(u));
  }

  const items = rows.map((row) => {
    const stock = row.StockNo ? stockByNo.get(row.StockNo) : undefined;
    const replenishedAt = row.Replenishment.ReplenishedAt;
    const waitingFrom =
      row.Status === "factory_order_placed" && row.FactoryOrderPlacedAt
        ? row.FactoryOrderPlacedAt
        : replenishedAt;

    return {
      itemId: row.ItemID,
      invoiceNo: row.InvoiceNo,
      partyName: partyByInvoice.get(row.InvoiceNo) ?? "—",
      styleNo: row.StyleNo,
      productDescription: stock?.ProductDescription ?? null,
      metalType: stock?.MetalType ?? null,
      metalPurity: stock?.MetalPurity ?? null,
      stoneShape: stock?.StoneShape ?? null,
      productType: stock?.ProductType ?? null,
      quantity: 1,
      status: row.Status,
      daysWaiting: daysSinceDate(waitingFrom),
      factoryOrderPlacedAt: row.FactoryOrderPlacedAt?.toISOString() ?? null,
      factoryOrderPlacedByName: row.FactoryOrderPlacedBy
        ? (placedByName.get(row.FactoryOrderPlacedBy) ?? null)
        : null,
    };
  });

  return NextResponse.json({ total, page, limit, items });
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { resolveClientInvoiceNos } from "@/lib/replenishment-pending-invoices";
import { classifyItemStatus, userDisplayName } from "@/lib/replenishment-item-status";

type InvoiceGroupRow = {
  invoiceNo: string;
  latestAt: Date;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment_history.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") ?? undefined;
  const invoiceNo = searchParams.get("invoiceNo")?.trim() ?? undefined;
  const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") ?? "25", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 25;
  const skip = (page - 1) * limit;

  let clientInvoiceNos: string[] | undefined;
  if (clientId) {
    const invoiceNos = await resolveClientInvoiceNos(clientId);
    if (invoiceNos === null) {
      return NextResponse.json({ message: "Client not found." }, { status: 404 });
    }
    if (invoiceNos.length === 0) {
      return NextResponse.json({ total: 0, page, limit, items: [] });
    }
    clientInvoiceNos = invoiceNos;
  }

  const invoiceFilter =
    invoiceNo && clientInvoiceNos
      ? clientInvoiceNos.includes(invoiceNo)
        ? [invoiceNo]
        : []
      : invoiceNo
        ? [invoiceNo]
        : clientInvoiceNos;

  if (invoiceFilter && invoiceFilter.length === 0) {
    return NextResponse.json({ total: 0, page, limit, items: [] });
  }

  const invoiceInClause =
    invoiceFilter && invoiceFilter.length > 0
      ? Prisma.sql`AND ri."InvoiceNo" IN (${Prisma.join(invoiceFilter)})`
      : Prisma.empty;

  const [countRow, invoiceRows] = await db.$transaction([
    db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT ri."InvoiceNo")::bigint AS count
      FROM replenishment_items ri
      INNER JOIN replenishments r ON r."ReplenishmentID" = ri."ReplenishmentID"
      WHERE r."IsUndone" = false
      ${invoiceInClause}
    `,
    db.$queryRaw<InvoiceGroupRow[]>`
      SELECT ri."InvoiceNo" AS "invoiceNo", MAX(r."ReplenishedAt") AS "latestAt"
      FROM replenishment_items ri
      INNER JOIN replenishments r ON r."ReplenishmentID" = ri."ReplenishmentID"
      WHERE r."IsUndone" = false
      ${invoiceInClause}
      GROUP BY ri."InvoiceNo"
      ORDER BY "latestAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
  ]);

  const total = Number(countRow[0]?.count ?? 0);
  if (invoiceRows.length === 0) {
    return NextResponse.json({ total, page, limit, items: [] });
  }

  const pageInvoiceNos = invoiceRows.map((r) => r.invoiceNo);

  const itemRows = await db.replenishment_items.findMany({
    where: {
      InvoiceNo: { in: pageInvoiceNos },
      Replenishment: { IsUndone: false },
    },
    orderBy: [{ InvoiceNo: "asc" }, { CreatedAt: "asc" }],
    include: {
      Replenishment: {
        include: {
          ReplenishedByUser: {
            select: { FirstName: true, LastName: true, Email: true },
          },
        },
      },
    },
  });

  const stockNos = [
    ...new Set(itemRows.map((r) => r.StockNo).filter((sn) => sn && sn !== "—")),
  ];
  const stockByNo = new Map<
    string,
    { ProductDescription: string | null; MetalType: string | null; MetalPurity: string | null }
  >();
  if (stockNos.length > 0) {
    const stockRows = await db.stock.findMany({
      where: { StockNo: { in: stockNos } },
      select: {
        StockNo: true,
        ProductDescription: true,
        MetalType: true,
        MetalPurity: true,
      },
    });
    for (const s of stockRows) stockByNo.set(s.StockNo, s);
  }

  const partyByInvoice = new Map<string, string>();
  const salesRows = await db.sales.findMany({
    where: { InvoiceNo: { in: pageInvoiceNos } },
    select: { InvoiceNo: true, PartyName: true },
    distinct: ["InvoiceNo", "PartyName"],
  });
  for (const s of salesRows) {
    if (!partyByInvoice.has(s.InvoiceNo) && s.PartyName?.trim()) {
      partyByInvoice.set(s.InvoiceNo, s.PartyName.trim());
    }
  }

  const itemsByInvoice = new Map<string, typeof itemRows>();
  for (const row of itemRows) {
    const list = itemsByInvoice.get(row.InvoiceNo) ?? [];
    list.push(row);
    itemsByInvoice.set(row.InvoiceNo, list);
  }

  const items = invoiceRows.map(({ invoiceNo: inv, latestAt }) => {
    const lines = itemsByInvoice.get(inv) ?? [];
    let confirmedCount = 0;
    let factoryCount = 0;
    let pendingCount = 0;

    const mappedItems = lines.map((line) => {
      const bucket = classifyItemStatus(line.Status);
      if (bucket === "confirmed") confirmedCount += 1;
      else if (bucket === "factory") factoryCount += 1;
      else if (bucket === "pending") pendingCount += 1;

      const stock = line.StockNo ? stockByNo.get(line.StockNo) : undefined;
      const byUser = line.Replenishment.ReplenishedByUser;

      return {
        itemId: line.ItemID,
        styleNo: line.StyleNo,
        status: line.Status,
        stockNo: line.StockNo,
        productDescription: stock?.ProductDescription ?? null,
        metalType: stock?.MetalType ?? null,
        metalPurity: stock?.MetalPurity ?? null,
        replenishedByName: userDisplayName(byUser),
        replenishedAt: line.Replenishment.ReplenishedAt.toISOString(),
      };
    });

    const latestLine = lines.reduce<(typeof lines)[number] | null>((best, line) => {
      if (!best) return line;
      return line.Replenishment.ReplenishedAt > best.Replenishment.ReplenishedAt ? line : best;
    }, null);

    const headerUser = latestLine?.Replenishment.ReplenishedByUser;

    return {
      invoiceNo: inv,
      partyName: partyByInvoice.get(inv) ?? "—",
      replenishedAt: latestAt.toISOString(),
      replenishedByName: headerUser ? userDisplayName(headerUser) : "—",
      totalItems: lines.length,
      confirmedCount,
      factoryCount,
      pendingCount,
      items: mappedItems,
    };
  });

  return NextResponse.json({ total, page, limit, items });
}

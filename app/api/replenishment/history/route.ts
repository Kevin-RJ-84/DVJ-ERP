import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { resolveClientInvoiceNos } from "@/lib/replenishment-pending-invoices";
import { classifyItemStatus, userDisplayName } from "@/lib/replenishment-item-status";

type HistoryGroupRow = {
  type: "invoice" | "style_upload";
  groupKey: string;
  latestAt: Date;
};

function extractMetalTypeFromGroupValue(groupValue: string): string | null {
  const part = groupValue.split("·")[1]?.trim();
  if (!part || part === "(any)") return null;
  return part;
}

function buildItemWhere(
  clientId: string | undefined,
  clientInvoiceNos: string[] | undefined,
  invoiceOrRef: string | undefined,
): Prisma.replenishment_itemsWhereInput {
  const base: Prisma.replenishment_itemsWhereInput = {
    IsActive: true,
    Replenishment: { IsUndone: false },
  };

  if (invoiceOrRef) {
    base.OR = [{ InvoiceNo: invoiceOrRef }, { StyleUploadRef: invoiceOrRef }];
    return base;
  }

  if (clientId && clientInvoiceNos) {
    base.OR = [
      { ClientID: clientId, StyleUploadRef: { not: null } },
      { StyleUploadRef: null, InvoiceNo: { in: clientInvoiceNos } },
    ];
    return base;
  }

  if (clientId) {
    base.ClientID = clientId;
  }

  return base;
}

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
  if (clientId && !invoiceNo) {
    const invoiceNos = await resolveClientInvoiceNos(clientId);
    if (invoiceNos === null) {
      return NextResponse.json({ message: "Client not found." }, { status: 404 });
    }
    if (invoiceNos.length === 0) {
      const styleUploadOnly = await db.replenishment_items.count({
        where: {
          IsActive: true,
          Replenishment: { IsUndone: false },
          ClientID: clientId,
          StyleUploadRef: { not: null },
        },
      });
      if (styleUploadOnly === 0) {
        return NextResponse.json({ total: 0, page, limit, items: [] });
      }
    }
    clientInvoiceNos = invoiceNos;
  }

  const itemWhere = buildItemWhere(clientId, clientInvoiceNos, invoiceNo);
  if (
    clientId &&
    clientInvoiceNos &&
    clientInvoiceNos.length === 0 &&
    !invoiceNo
  ) {
    itemWhere.OR = [{ ClientID: clientId, StyleUploadRef: { not: null } }];
  }

  if (
    clientId &&
    clientInvoiceNos &&
    clientInvoiceNos.length === 0 &&
    invoiceNo
  ) {
    return NextResponse.json({ total: 0, page, limit, items: [] });
  }

  const matchingItems = await db.replenishment_items.findMany({
    where: itemWhere,
    select: {
      ItemID: true,
      InvoiceNo: true,
      StyleUploadRef: true,
      ReplenishmentType: true,
      CreatedAt: true,
      Replenishment: { select: { ReplenishedAt: true } },
    },
  });

  const groupMap = new Map<string, { type: "invoice" | "style_upload"; latestAt: Date }>();
  for (const row of matchingItems) {
    const isStyleUpload = Boolean(row.StyleUploadRef);
    const type: "invoice" | "style_upload" = isStyleUpload ? "style_upload" : "invoice";
    const groupKey = isStyleUpload ? row.StyleUploadRef! : row.InvoiceNo;
    const latestAt = row.Replenishment.ReplenishedAt;
    const existing = groupMap.get(groupKey);
    if (!existing || latestAt > existing.latestAt) {
      groupMap.set(groupKey, { type, latestAt });
    }
  }

  const sortedGroups: HistoryGroupRow[] = [...groupMap.entries()]
    .map(([groupKey, meta]) => ({
      type: meta.type,
      groupKey,
      latestAt: meta.latestAt,
    }))
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());

  const total = sortedGroups.length;
  const pageGroups = sortedGroups.slice(skip, skip + limit);

  if (pageGroups.length === 0) {
    return NextResponse.json({ total, page, limit, items: [] });
  }

  const pageInvoiceNos = pageGroups.filter((g) => g.type === "invoice").map((g) => g.groupKey);
  const pageStyleUploadRefs = pageGroups.filter((g) => g.type === "style_upload").map((g) => g.groupKey);

  const groupOr: Prisma.replenishment_itemsWhereInput[] = [];
  if (pageInvoiceNos.length > 0) {
    groupOr.push({
      StyleUploadRef: null,
      InvoiceNo: { in: pageInvoiceNos },
    });
  }
  if (pageStyleUploadRefs.length > 0) {
    groupOr.push({
      StyleUploadRef: { in: pageStyleUploadRefs },
    });
  }

  const itemRows = await db.replenishment_items.findMany({
    where: {
      IsActive: true,
      Replenishment: { IsUndone: false },
      OR: groupOr,
    },
    orderBy: [{ CreatedAt: "asc" }],
    include: {
      Client: { select: { PartyName: true } },
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
    ...new Set(itemRows.map((r) => r.StockNo).filter((sn) => sn && sn !== "—" && sn !== "-")),
  ];
  const stockByNo = new Map<
    string,
    {
      ProductDescription: string | null;
      MetalType: string | null;
      MetalPurity: string | null;
      HoldCompany: string | null;
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
        HoldCompany: true,
      },
    });
    for (const s of stockRows) stockByNo.set(s.StockNo, s);
  }

  const partyByInvoice = new Map<string, string>();
  if (pageInvoiceNos.length > 0) {
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
  }

  const itemsByGroup = new Map<string, typeof itemRows>();
  for (const row of itemRows) {
    const groupKey = row.StyleUploadRef ?? row.InvoiceNo;
    const list = itemsByGroup.get(groupKey) ?? [];
    list.push(row);
    itemsByGroup.set(groupKey, list);
  }

  const items = pageGroups.map(({ type, groupKey, latestAt }) => {
    const lines = itemsByGroup.get(groupKey) ?? [];
    let confirmedCount = 0;
    let factoryCount = 0;
    let pendingCount = 0;
    let soldCount = 0;
    let rescanableCount = 0;

    const mappedItems = lines.map((line) => {
      const status = line.Status.toLowerCase();
      if (status === "sold") {
        soldCount += 1;
      } else {
        rescanableCount += 1;
        const bucket = classifyItemStatus(line.Status);
        if (bucket === "confirmed") confirmedCount += 1;
        else if (bucket === "factory") factoryCount += 1;
        else if (bucket === "pending") pendingCount += 1;
      }

      const stock = line.StockNo ? stockByNo.get(line.StockNo) : undefined;
      const byUser = line.Replenishment.ReplenishedByUser;
      const metalType =
        stock?.MetalType ?? extractMetalTypeFromGroupValue(line.GroupValue) ?? null;

      return {
        itemId: line.ItemID,
        styleNo: line.StyleNo,
        metalType,
        status: line.Status,
        stockNo: line.StockNo,
        holdCompany: stock?.HoldCompany ?? null,
        productDescription: stock?.ProductDescription ?? null,
        metalPurity: stock?.MetalPurity ?? null,
        replenishedByName: userDisplayName(byUser),
        replenishedAt: line.Replenishment.ReplenishedAt.toISOString(),
        rescanCount: line.RescanCount,
        lastRescannedAt: line.LastRescannedAt?.toISOString() ?? null,
        canRescan: status !== "sold",
      };
    });

    const latestLine = lines.reduce<(typeof lines)[number] | null>((best, line) => {
      if (!best) return line;
      return line.Replenishment.ReplenishedAt > best.Replenishment.ReplenishedAt ? line : best;
    }, null);

    const headerUser = latestLine?.Replenishment.ReplenishedByUser;
    const partyName =
      type === "style_upload"
        ? latestLine?.Client?.PartyName?.trim() ?? lines[0]?.Client?.PartyName?.trim() ?? "—"
        : partyByInvoice.get(groupKey) ?? "—";

    return {
      type,
      invoiceNo: type === "invoice" ? groupKey : null,
      styleUploadRef: type === "style_upload" ? groupKey : null,
      replenishmentType: type,
      partyName,
      replenishedAt: latestAt.toISOString(),
      replenishedByName: headerUser ? userDisplayName(headerUser) : "—",
      totalItems: lines.length,
      confirmedCount,
      factoryCount,
      pendingCount,
      soldCount,
      rescanableCount,
      items: mappedItems,
    };
  });

  return NextResponse.json({ total, page, limit, items });
}

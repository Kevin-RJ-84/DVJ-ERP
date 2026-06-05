import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { resolveClientInvoiceNos } from "@/lib/replenishment-pending-invoices";
import { daysSinceDate, PULLBACK_SCREEN_STATUSES } from "@/lib/replenishment-item-status";

const itemInclude = {
  Replenishment: {
    select: {
      ReplenishedAt: true,
    },
  },
  PullbackHistory: {
    orderBy: { ContactedAt: "desc" as const },
    take: 1,
    select: {
      ContactedAt: true,
      ClientResponse: true,
    },
  },
} as const;

type ItemRow = Prisma.replenishment_itemsGetPayload<{ include: typeof itemInclude }>;

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
      : { in: [...PULLBACK_SCREEN_STATUSES] },
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
      include: itemInclude,
    }),
  ]);

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

  const items = rows.map((row: ItemRow) => {
    const lastContact = row.PullbackHistory[0];
    const replenishedAt = row.Replenishment.ReplenishedAt;
    return {
      itemId: row.ItemID,
      invoiceNo: row.InvoiceNo,
      partyName: partyByInvoice.get(row.InvoiceNo) ?? "—",
      styleNo: row.StyleNo,
      status: row.Status,
      pullbackCandidateCount: row.PullbackCandidateCount ?? 0,
      lastContactAt: lastContact?.ContactedAt.toISOString() ?? null,
      lastContactResponse: lastContact?.ClientResponse ?? null,
      replenishedAt: replenishedAt.toISOString(),
      daysPending: daysSinceDate(replenishedAt),
    };
  });

  return NextResponse.json({ total, page, limit, items });
}

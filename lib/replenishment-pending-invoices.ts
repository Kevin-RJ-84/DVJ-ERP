import { db } from "@/lib/db";
import { getConfigBool } from "@/lib/config";

function trimOrNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t || null;
}

function coalesceStr(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const t = trimOrNull(v);
    if (t) return t;
  }
  return null;
}

function daysSince(date: Date): number {
  const today = new Date();
  const startToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((startToday - startDate) / 86_400_000);
}

export type PendingInvoiceRow = {
  invoiceNo: string;
  partyName: string;
  pieceCount: number;
  invoiceDate: string;
  daysSinceSold: number;
};

function saleLineIsPending(
  invoiceNo: string,
  sale: {
    StyleNo: string | null;
    ProductType: string | null;
    STShapes: string | null;
    Metal: string | null;
    MetalType: string | null;
    Stock: {
      StyleNo: string | null;
      ProductType: string | null;
      StoneShape: string | null;
      Metal: string | null;
      MetalType: string | null;
      ProductStyle: string | null;
    } | null;
  },
  partialVisibility: boolean,
  excludedInvoiceNos: Set<string>,
  replenishedCombos: Set<string>,
): boolean {
  if (!partialVisibility) {
    return !excludedInvoiceNos.has(invoiceNo);
  }
  const st = sale.Stock;
  if (!st) return true;
  const candidates: [string, string | null][] = [
    ["StyleNo", coalesceStr(sale.StyleNo, st.StyleNo)],
    ["ProductType", coalesceStr(sale.ProductType, st.ProductType)],
    ["StoneShape", coalesceStr(st.StoneShape, sale.STShapes)],
    ["Metal", coalesceStr(sale.Metal, st.Metal)],
    ["MetalType", coalesceStr(sale.MetalType, st.MetalType)],
    ["ProductStyle", trimOrNull(st.ProductStyle)],
  ];
  for (const [field, value] of candidates) {
    if (value && replenishedCombos.has(JSON.stringify([invoiceNo, field, value]))) {
      return false;
    }
  }
  return true;
}

/** Sales invoices that still need replenishment (mirrors v2 exclusion logic). */
export async function getPendingInvoiceRows(): Promise<PendingInvoiceRow[]> {
  const partialVisibility = await getConfigBool("partial_replenishment_visibility");

  const salesRows = await db.sales.findMany({
    where: { StockNo: { not: null } },
    select: {
      InvoiceNo: true,
      InvoiceDate: true,
      PartyName: true,
      StyleNo: true,
      ProductType: true,
      STShapes: true,
      Metal: true,
      MetalType: true,
      Stock: {
        select: {
          StyleNo: true,
          ProductType: true,
          StoneShape: true,
          Metal: true,
          MetalType: true,
          ProductStyle: true,
        },
      },
    },
  });

  if (salesRows.length === 0) return [];

  const invoiceNos = [...new Set(salesRows.map((s) => s.InvoiceNo))];
  const activeReps = await db.replenishments.findMany({
    where: { InvoiceNo: { in: invoiceNos }, IsUndone: false },
    select: { InvoiceNo: true, GroupField: true, GroupValue: true },
  });

  const excludedInvoiceNos = new Set<string>();
  const replenishedCombos = new Set<string>();

  if (!partialVisibility) {
    for (const r of activeReps) excludedInvoiceNos.add(r.InvoiceNo);
  } else {
    for (const r of activeReps) {
      replenishedCombos.add(JSON.stringify([r.InvoiceNo, r.GroupField, r.GroupValue]));
    }
  }

  const aggregates = new Map<
    string,
    { partyName: string; invoiceDate: Date; pieceCount: number; hasPendingLine: boolean }
  >();

  for (const sale of salesRows) {
    if (!sale.Stock) continue;
    const pending = saleLineIsPending(
      sale.InvoiceNo,
      sale,
      partialVisibility,
      excludedInvoiceNos,
      replenishedCombos,
    );
    if (!pending) continue;

    const existing = aggregates.get(sale.InvoiceNo);
    if (existing) {
      existing.pieceCount += 1;
      if (sale.InvoiceDate < existing.invoiceDate) {
        existing.invoiceDate = sale.InvoiceDate;
      }
      if (!existing.partyName && sale.PartyName?.trim()) {
        existing.partyName = sale.PartyName.trim();
      }
    } else {
      aggregates.set(sale.InvoiceNo, {
        partyName: sale.PartyName?.trim() ?? "—",
        invoiceDate: sale.InvoiceDate,
        pieceCount: 1,
        hasPendingLine: true,
      });
    }
  }

  return [...aggregates.entries()]
    .filter(([, agg]) => agg.hasPendingLine)
    .map(([invoiceNo, agg]) => ({
      invoiceNo,
      partyName: agg.partyName,
      pieceCount: agg.pieceCount,
      invoiceDate: agg.invoiceDate.toISOString().slice(0, 10),
      daysSinceSold: daysSince(agg.invoiceDate),
    }));
}

export async function resolveClientInvoiceNos(clientId: string): Promise<string[] | null> {
  const client = await db.clients.findUnique({
    where: { ClientID: clientId },
    select: { PartyCode: true, PartyName: true },
  });
  if (!client) return null;

  const salesRows = await db.sales.findMany({
    where: {
      OR: [
        ...(client.PartyCode ? [{ PartyCode: client.PartyCode }] : []),
        { PartyName: client.PartyName },
      ],
    },
    select: { InvoiceNo: true },
    distinct: ["InvoiceNo"],
  });
  return salesRows.map((s) => s.InvoiceNo);
}

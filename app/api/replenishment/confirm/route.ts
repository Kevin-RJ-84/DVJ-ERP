import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { REPLENISHMENT_GROUP_FIELDS, type ReplenishmentGroupField } from "@/lib/replenishment-v2";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

const pullbackItemSchema = z
  .object({
    StockNo: z.string().min(1),
    MemoNo: z.string().min(1),
    PartyName: z.string().nullable().optional(),
    MemoEndDate: z.string(),
    MemoID: z.string().uuid().optional(),
    CloseToExpiryDays: z.number().optional(),
    OverallRank: z.number().nullable().optional(),
    StyleRank: z.number().nullable().optional(),
    StyleNo: z.string().nullable().optional(),
    ProductDescription: z.string().nullable().optional(),
  })
  .passthrough();

const pullbackChangeHistoryEntrySchema = z.object({
  previousItems: z.array(pullbackItemSchema),
  reason: z.string().min(1),
  changedAt: z.string(),
});

const contactLogEntrySchema = z.object({
  channel: z.string(),
  response: z.string(),
  notes: z.string(),
  salesperson: z.string(),
  loggedAt: z.string(),
  localId: z.string(),
});

const pullbackContactLogBucketSchema = z.object({
  stockNo: z.string().min(1),
  logs: z.array(contactLogEntrySchema),
});

const allocationSchema = z.object({
  memoAlloc: z.number().int().min(0),
  stockAlloc: z.number().int().min(0),
  pullAlloc: z.number().int().min(0),
  factoryAllocDisplay: z.number().int().min(0),
  pullbackAvail: z.number().int().min(0),
});

const pullbackBadgeSchema = z.enum(["pullback_available", "pullback_confirmed", "pb_in_progress"]).nullable();

const bodySchema = z.object({
  groupField: z.enum(REPLENISHMENT_GROUP_FIELDS),
  rows: z
    .array(
      z.object({
        groupValue: z.string().min(1),
        invoiceNos: z.array(z.string().min(1)).min(1),
        overrideQty: z.number().int().min(0),
        skippedPullback: z.boolean().optional().default(false),
        allocation: allocationSchema,
        pullbackBadge: pullbackBadgeSchema.optional().default(null),
        clientMemoStockNos: z.array(z.string().min(1)).optional().default([]),
        stockNos: z
          .array(
            z.object({
              stockNo: z.string().min(1),
              type: z.enum(["warehouse", "pullback"]),
            }),
          )
          .optional()
          .default([]),
        confirmedPullbackItems: z.array(pullbackItemSchema).optional().default([]),
        pullbackChangeHistory: z.array(pullbackChangeHistoryEntrySchema).optional().default([]),
        pullbackContactLogs: z.array(pullbackContactLogBucketSchema).optional().default([]),
      }),
    )
    .min(1),
});

type ParsedRow = z.infer<typeof bodySchema>["rows"][number];

const GROUP_TO_SALES_FIELD: Record<
  Exclude<ReplenishmentGroupField, "StyleNo" | "ProductStyle">,
  keyof Prisma.salesWhereInput
> = {
  ProductType: "ProductType",
  StoneShape: "STShapes",
  Metal: "Metal",
  MetalType: "MetalType",
};

async function resolveStyleNo(
  groupField: ReplenishmentGroupField,
  groupValue: string,
  invoiceNos: string[],
): Promise<string> {
  if (groupField === "StyleNo") return groupValue;
  if (invoiceNos.length === 0) return groupValue;
  const invWhere: Prisma.salesWhereInput = { InvoiceNo: { in: invoiceNos } };

  if (groupField === "ProductStyle") {
    const hit = await db.sales.findFirst({
      where: invWhere,
      select: { StyleNo: true, StockNo: true },
    });
    if (hit?.StyleNo?.trim()) return hit.StyleNo.trim();
    if (hit?.StockNo) {
      const st = await db.stock.findFirst({
        where: { StockNo: hit.StockNo },
        select: { StyleNo: true },
      });
      if (st?.StyleNo?.trim()) return st.StyleNo.trim();
    }
    return groupValue;
  }

  const col = GROUP_TO_SALES_FIELD[groupField as keyof typeof GROUP_TO_SALES_FIELD];
  if (col) {
    const hit = await db.sales.findFirst({
      where: { ...invWhere, [col]: groupValue },
      select: { StyleNo: true },
    });
    if (hit?.StyleNo?.trim()) return hit.StyleNo.trim();
  }

  const anySale = await db.sales.findFirst({
    where: invWhere,
    select: { StyleNo: true },
  });
  return anySale?.StyleNo?.trim() || groupValue;
}

type ItemDraft = {
  InvoiceNo: string;
  GroupField: string;
  GroupValue: string;
  StockNo: string;
  Type: "warehouse" | "pullback" | "memo" | "factory";
  ReplenishedBy: string;
  styleNo: string;
  Status: string;
  PullbackCandidateCount: number;
  pullbackMemoNo?: string;
};

function logResponseKey(resp: string): string {
  return resp.trim().toLowerCase().replace(/\s+/g, "_");
}

function lastLogResponse(row: ParsedRow, stockNo: string): string | null {
  const bucket = row.pullbackContactLogs.find((b) => b.stockNo === stockNo);
  if (!bucket || bucket.logs.length === 0) return null;
  const sorted = [...bucket.logs].sort(
    (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime(),
  );
  return sorted[sorted.length - 1]?.response ?? null;
}

function getConfirmStatus(row: ParsedRow): string {
  const { memoAlloc, stockAlloc, factoryAllocDisplay, pullbackAvail } = row.allocation;
  const badge = row.pullbackBadge;
  const warehouseCount = row.stockNos.filter((s) => s.type === "warehouse").length;

  if (warehouseCount > 0) return "stock";
  if (memoAlloc > 0 && stockAlloc === 0) return "memo";
  if (badge === "pullback_confirmed") return "pullback_confirmed";
  if (badge === "pb_in_progress") return "pending_pullback";
  if (badge === "pullback_available" && !row.skippedPullback) return "pullback_available";
  if (row.skippedPullback || factoryAllocDisplay > 0) return "factory_order";
  if (pullbackAvail > 0 && !row.skippedPullback) return "pullback_available";
  return "factory_order";
}

function buildItemDrafts(
  groupField: ReplenishmentGroupField,
  rows: ParsedRow[],
  userId: string,
  styleByGroupValue: Map<string, string>,
): ItemDraft[] {
  const out: ItemDraft[] = [];

  for (const row of rows) {
    const styleNo = styleByGroupValue.get(row.groupValue) ?? row.groupValue;
    const { memoAlloc, pullAlloc, factoryAllocDisplay, pullbackAvail } = row.allocation;
    const badge = row.pullbackBadge;
    const warehouseStocks = row.stockNos.filter((s) => s.type === "warehouse");
    const candidateCount = pullbackAvail;

    for (const invoiceNo of row.invoiceNos) {
      for (const { stockNo } of warehouseStocks) {
        out.push({
          InvoiceNo: invoiceNo,
          GroupField: groupField,
          GroupValue: row.groupValue,
          StockNo: stockNo,
          Type: "warehouse",
          ReplenishedBy: userId,
          styleNo,
          Status: "stock",
          PullbackCandidateCount: candidateCount,
        });
      }

      for (let i = 0; i < memoAlloc; i++) {
        const memoStock = row.clientMemoStockNos[i] ?? row.clientMemoStockNos[0] ?? "—";
        out.push({
          InvoiceNo: invoiceNo,
          GroupField: groupField,
          GroupValue: row.groupValue,
          StockNo: memoStock,
          Type: "memo",
          ReplenishedBy: userId,
          styleNo,
          Status: "memo",
          PullbackCandidateCount: candidateCount,
        });
      }

      for (const pb of row.confirmedPullbackItems) {
        let status = "pullback_confirmed";
        if (badge === "pb_in_progress") {
          const resp = lastLogResponse(row, pb.StockNo);
          status = resp && logResponseKey(resp) === "accepted" ? "pullback_confirmed" : "pending_pullback";
        }
        out.push({
          InvoiceNo: invoiceNo,
          GroupField: groupField,
          GroupValue: row.groupValue,
          StockNo: pb.StockNo,
          Type: "pullback",
          ReplenishedBy: userId,
          styleNo,
          Status: status,
          PullbackCandidateCount: candidateCount,
          pullbackMemoNo: pb.MemoNo,
        });
      }

      const confirmedCount = row.confirmedPullbackItems.length;
      const unconfirmedPullSlots = Math.max(0, pullAlloc - confirmedCount);

      if (badge === "pullback_available" && !row.skippedPullback && unconfirmedPullSlots > 0) {
        for (let i = 0; i < unconfirmedPullSlots; i++) {
          out.push({
            InvoiceNo: invoiceNo,
            GroupField: groupField,
            GroupValue: row.groupValue,
            StockNo: "—",
            Type: "pullback",
            ReplenishedBy: userId,
            styleNo,
            Status: "pullback_available",
            PullbackCandidateCount: candidateCount,
          });
        }
      }

      if (badge === "pb_in_progress" && pullAlloc > confirmedCount) {
        for (let i = 0; i < pullAlloc - confirmedCount; i++) {
          out.push({
            InvoiceNo: invoiceNo,
            GroupField: groupField,
            GroupValue: row.groupValue,
            StockNo: "—",
            Type: "pullback",
            ReplenishedBy: userId,
            styleNo,
            Status: "pending_pullback",
            PullbackCandidateCount: candidateCount,
          });
        }
      }

      for (let i = 0; i < factoryAllocDisplay; i++) {
        out.push({
          InvoiceNo: invoiceNo,
          GroupField: groupField,
          GroupValue: row.groupValue,
          StockNo: "—",
          Type: "factory",
          ReplenishedBy: userId,
          styleNo,
          Status: "factory_order",
          PullbackCandidateCount: candidateCount,
        });
      }

      if (
        out.filter(
          (d) => d.InvoiceNo === invoiceNo && d.GroupValue === row.groupValue,
        ).length === 0 &&
        row.overrideQty === 0
      ) {
        continue;
      }

      if (
        out.filter(
          (d) => d.InvoiceNo === invoiceNo && d.GroupValue === row.groupValue,
        ).length === 0
      ) {
        const fallback = getConfirmStatus(row);
        out.push({
          InvoiceNo: invoiceNo,
          GroupField: groupField,
          GroupValue: row.groupValue,
          StockNo: "—",
          Type: fallback === "factory_order" ? "factory" : "pullback",
          ReplenishedBy: userId,
          styleNo,
          Status: fallback,
          PullbackCandidateCount: candidateCount,
        });
      }
    }
  }

  return dedupeItemDrafts(out);
}

function dedupeItemDrafts(records: ItemDraft[]): ItemDraft[] {
  const seen = new Set<string>();
  const out: ItemDraft[] = [];
  for (const r of records) {
    const k = `${r.InvoiceNo}|${r.GroupValue}|${r.StockNo}|${r.Status}|${r.Type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function resolveContactUserId(
  salespersonLabel: string,
  usersList: { UserID: string; Username: string; FirstName: string; LastName: string }[],
  fallbackUserId: string,
): string {
  const t = salespersonLabel.trim();
  if (!t) return fallbackUserId;
  const lower = t.toLowerCase();
  for (const u of usersList) {
    if (u.Username.toLowerCase() === lower) return u.UserID;
    const full = `${u.FirstName} ${u.LastName}`.trim().toLowerCase();
    if (full === lower) return u.UserID;
    if (u.FirstName.toLowerCase() === lower || u.LastName.toLowerCase() === lower) return u.UserID;
  }
  return fallbackUserId;
}

function countByStatus(items: ItemDraft[]) {
  let confirmedCount = 0;
  let pendingPullbackCount = 0;
  let factoryOrderCount = 0;
  let pullbackUnactionedCount = 0;

  for (const item of items) {
    const s = item.Status;
    if (s === "stock" || s === "memo" || s === "pullback_confirmed") confirmedCount += 1;
    else if (s === "pending_pullback") pendingPullbackCount += 1;
    else if (s === "factory_order") factoryOrderCount += 1;
    else if (s === "pullback" || s === "pullback_available") pullbackUnactionedCount += 1;
  }

  return { confirmedCount, pendingPullbackCount, factoryOrderCount, pullbackUnactionedCount };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.confirm");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const { groupField, rows } = parsed.data;

  const inProgressCount = rows.filter((r) => r.pullbackBadge === "pb_in_progress").length;
  if (!force && inProgressCount > 0) {
    return NextResponse.json({ needsConfirmation: true, inProgressCount });
  }

  const styleByGroupValue = new Map<string, string>();
  for (const row of rows) {
    const sn = await resolveStyleNo(groupField, row.groupValue, row.invoiceNos);
    styleByGroupValue.set(row.groupValue, sn);
  }

  const itemDrafts = buildItemDrafts(groupField, rows, auth.userId, styleByGroupValue);

  if (itemDrafts.length === 0) {
    return NextResponse.json({ message: "No replenishment records to save." }, { status: 400 });
  }

  const statusCounts = countByStatus(itemDrafts);

  const { replenishmentIds, itemsCreated, pullbackHistoryCreated, selectionHistoryCreated } =
    await db.$transaction(async (tx) => {
      const memoNos = new Set<string>();
      for (const r of itemDrafts) {
        if (r.pullbackMemoNo) memoNos.add(r.pullbackMemoNo);
      }
      const memos =
        memoNos.size > 0
          ? await tx.memo.findMany({
              where: { MemoNo: { in: [...memoNos] } },
              select: { MemoID: true, MemoNo: true, ClientID: true },
            })
          : [];
      const memoByNo = new Map(memos.map((m) => [m.MemoNo, m]));

      const activeUsers = await tx.users.findMany({
        where: { IsActive: true },
        select: { UserID: true, Username: true, FirstName: true, LastName: true },
      });

      const created = await tx.replenishments.createManyAndReturn({
        data: itemDrafts.map((r) => ({
          InvoiceNo: r.InvoiceNo,
          GroupField: r.GroupField,
          GroupValue: r.GroupValue,
          StockNo: r.StockNo,
          Type: r.Type === "factory" ? "factory_order" : r.Type === "memo" ? "memo" : r.Type,
          ReplenishedBy: r.ReplenishedBy,
        })),
        select: { ReplenishmentID: true },
      });

      const itemRows: Prisma.replenishment_itemsCreateManyInput[] = itemDrafts.map((r, i) => {
        const repId = created[i]!.ReplenishmentID;
        const isPullback = r.Type === "pullback";
        const memo = r.pullbackMemoNo ? memoByNo.get(r.pullbackMemoNo) : undefined;
        return {
          ReplenishmentID: repId,
          InvoiceNo: r.InvoiceNo,
          StyleNo: r.styleNo,
          GroupField: r.GroupField,
          GroupValue: r.GroupValue,
          StockNo: r.StockNo,
          Status: r.Status,
          PullbackCandidateCount: r.PullbackCandidateCount,
          IsActive: true,
          PullbackMemoID: isPullback && memo ? memo.MemoID : null,
          PullbackClientID: isPullback && memo?.ClientID ? memo.ClientID : null,
          PullbackStatus:
            isPullback && (r.Status === "pullback" || r.Status === "pullback_available" || r.Status === "pending_pullback")
              ? "pending"
              : isPullback && r.Status === "pullback_confirmed"
                ? "confirmed"
                : null,
          CreatedBy: auth.userId,
        };
      });

      await tx.replenishment_items.createMany({ data: itemRows });

      const items = await tx.replenishment_items.findMany({
        where: { ReplenishmentID: { in: created.map((c) => c.ReplenishmentID) } },
        select: {
          ItemID: true,
          ReplenishmentID: true,
          StockNo: true,
          Status: true,
          GroupValue: true,
          InvoiceNo: true,
          StyleNo: true,
        },
        orderBy: { ItemID: "asc" },
      });

      await tx.replenishment_status_log.createMany({
        data: items.map((it) => ({
          ItemID: it.ItemID,
          InvoiceNo: it.InvoiceNo,
          StyleNo: it.StyleNo,
          FromStatus: null,
          ToStatus: it.Status,
          ChangedBy: auth.userId,
        })),
      });

      let pullbackHist = 0;
      let selectionHist = 0;

      const pullbackItemIdsByGroupStock = new Map<string, string[]>();
      for (const it of items) {
        if (!["pullback", "pending_pullback", "pullback_confirmed"].includes(it.Status)) continue;
        const k = `${it.GroupValue}|${it.StockNo}`;
        const arr = pullbackItemIdsByGroupStock.get(k) ?? [];
        arr.push(it.ItemID);
        pullbackItemIdsByGroupStock.set(k, arr);
      }

      const firstPullbackItemIdByGroup = new Map<string, string>();
      for (const it of items) {
        if (!["pullback", "pending_pullback", "pullback_confirmed"].includes(it.Status)) continue;
        const cur = firstPullbackItemIdByGroup.get(it.GroupValue);
        if (!cur || it.ItemID < cur) {
          firstPullbackItemIdByGroup.set(it.GroupValue, it.ItemID);
        }
      }

      for (const row of rows) {
        for (const bucket of row.pullbackContactLogs) {
          const key = `${row.groupValue}|${bucket.stockNo}`;
          const itemIds = pullbackItemIdsByGroupStock.get(key) ?? [];
          if (itemIds.length === 0) continue;
          for (const itemId of itemIds) {
            for (const log of bucket.logs) {
              const contactedBy = resolveContactUserId(log.salesperson, activeUsers, auth.userId);
              await tx.pullback_history.create({
                data: {
                  ReplenishmentItemID: itemId,
                  ContactedAt: new Date(log.loggedAt),
                  Channel: log.channel,
                  ContactedBy: contactedBy,
                  ClientResponse: log.response,
                  Notes: log.notes?.trim() ? log.notes.trim() : null,
                },
              });
              pullbackHist += 1;
            }
          }
        }
      }

      for (const row of rows) {
        const anchorId = firstPullbackItemIdByGroup.get(row.groupValue);
        if (!anchorId) continue;
        for (const entry of row.pullbackChangeHistory) {
          await tx.pullback_selection_history.create({
            data: {
              ReplenishmentItemID: anchorId,
              PreviousStockNo: entry.previousItems[0]?.StockNo ?? null,
              NewStockNo: row.confirmedPullbackItems[0]?.StockNo ?? null,
              Reason: entry.reason,
              ChangedBy: auth.userId,
              ChangedAt: new Date(entry.changedAt),
            },
          });
          selectionHist += 1;
        }
      }

      return {
        replenishmentIds: created.map((c) => c.ReplenishmentID),
        itemsCreated: items.length,
        pullbackHistoryCreated: pullbackHist,
        selectionHistoryCreated: selectionHist,
      };
    });

  return NextResponse.json({
    success: true,
    replenishmentIds,
    itemsCreated,
    confirmedCount: statusCounts.confirmedCount,
    pendingPullbackCount: statusCounts.pendingPullbackCount,
    factoryOrderCount: statusCounts.factoryOrderCount,
    pullbackUnactionedCount: statusCounts.pullbackUnactionedCount,
    pullbackHistoryCreated,
    selectionHistoryCreated,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const bodySchema = z.union([
  z.object({ itemIds: z.array(z.string().uuid()).min(1) }),
  z.object({ invoiceNo: z.string().min(1) }),
  z.object({ styleUploadRef: z.string().min(1) }),
  z.object({
    all: z.literal(true),
    clientId: z.string().uuid().optional(),
  }),
]);

type RescanItemRow = {
  ItemID: string;
  InvoiceNo: string;
  StyleNo: string;
  GroupValue: string;
  StockNo: string;
  Status: string;
  StyleUploadRef: string | null;
  ClientID: string | null;
};

type RescanItemOutcome = {
  changed: boolean;
  oldStatus: string;
  newStatus: string;
  oldStockNo: string | null;
  newStockNo: string | null;
};

const LOCKED_STATUSES = new Set(["stock", "memo", "hold", "pullback_confirmed"]);
const OPEN_STATUSES = new Set([
  "pullback_available",
  "pb_in_progress",
  "pending_pullback",
  "factory_order",
  "pullback",
]);

const ITEM_SELECT = {
  ItemID: true,
  InvoiceNo: true,
  StyleNo: true,
  GroupValue: true,
  StockNo: true,
  Status: true,
  StyleUploadRef: true,
  ClientID: true,
} satisfies Prisma.replenishment_itemsSelect;

function normalizeMetalType(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function matchesMetalType(stockMetalType: string | null, targetMetalType: string | null): boolean {
  if (!targetMetalType || targetMetalType.trim() === "") return true;
  return normalizeMetalType(stockMetalType) === normalizeMetalType(targetMetalType);
}

function extractMetalType(groupValue: string): string | null {
  const part = groupValue.split("·")[1]?.trim();
  if (!part || part === "(any)") return null;
  return part;
}

function isRealStockNo(stockNo: string | null | undefined): boolean {
  const s = stockNo?.trim();
  return Boolean(s && s !== "—" && s !== "-");
}

async function rescanLockedItem(
  item: RescanItemRow,
  oldStatus: string,
): Promise<RescanItemOutcome> {
  const oldStockNo = item.StockNo;
  if (!isRealStockNo(oldStockNo)) {
    return { changed: false, oldStatus, newStatus: oldStatus, oldStockNo, newStockNo: oldStockNo };
  }

  const stockNo = oldStockNo.trim();

  const isSold = await db.sales.findFirst({
    where: { StockNo: stockNo },
    select: { SalesID: true },
  });
  if (isSold) {
    return { changed: true, oldStatus, newStatus: "sold", oldStockNo, newStockNo: stockNo };
  }

  const onMemo = await db.memo_stock.findFirst({
    where: {
      StockNo: stockNo,
      Status: "active",
      Memo: { is: { IsActive: true } },
    },
    select: { MemoStockID: true },
  });
  if (onMemo && oldStatus !== "memo") {
    return { changed: true, oldStatus, newStatus: "memo", oldStockNo, newStockNo: stockNo };
  }

  const onHold = await db.stock.findFirst({
    where: {
      StockNo: stockNo,
      HoldDate: { not: null },
      HoldCompany: { not: null },
    },
    select: { StockNo: true },
  });
  if (onHold && oldStatus === "pullback_confirmed") {
    return { changed: true, oldStatus, newStatus: "hold", oldStockNo, newStockNo: stockNo };
  }

  return { changed: false, oldStatus, newStatus: oldStatus, oldStockNo, newStockNo: stockNo };
}

async function findOpenHoldStock(
  styleNo: string,
  clientId: string,
  metalType: string | null,
): Promise<string | null> {
  const client = await db.clients.findUnique({
    where: { ClientID: clientId },
    select: { PartyName: true },
  });
  if (!client?.PartyName) return null;

  const candidates = await db.stock.findMany({
    where: {
      StyleNo: styleNo,
      HoldCompany: { equals: client.PartyName, mode: "insensitive" },
      HoldDate: { not: null },
      Sales: { none: {} },
      MemoStockLinks: {
        none: { Status: "active", Memo: { is: { IsActive: true } } },
      },
    },
    select: { StockNo: true, MetalType: true },
    orderBy: { StockNo: "asc" },
    take: 20,
  });

  const match = candidates.find((c) => matchesMetalType(c.MetalType, metalType));
  return match?.StockNo ?? null;
}

async function findOpenMemoStock(
  styleNo: string,
  clientId: string,
  metalType: string | null,
): Promise<string | null> {
  const candidates = await db.memo_stock.findMany({
    where: {
      Status: "active",
      Stock: { is: { StyleNo: styleNo } },
      Memo: { is: { IsActive: true, ClientID: clientId } },
    },
    select: {
      StockNo: true,
      Stock: { select: { MetalType: true } },
    },
    orderBy: { StockNo: "asc" },
    take: 20,
  });

  const match = candidates.find((c) => matchesMetalType(c.Stock?.MetalType ?? null, metalType));
  return match?.StockNo ?? null;
}

async function findOpenWarehouseStock(styleNo: string, metalType: string | null): Promise<string | null> {
  const candidates = await db.stock.findMany({
    where: {
      StyleNo: styleNo,
      HoldDate: null,
      Sales: { none: {} },
      MemoStockLinks: {
        none: { Status: "active", Memo: { is: { IsActive: true } } },
      },
    },
    select: { StockNo: true, MetalType: true },
    orderBy: { StockNo: "asc" },
    take: 20,
  });

  const match = candidates.find((c) => matchesMetalType(c.MetalType, metalType));
  return match?.StockNo ?? null;
}

async function findOpenPullbackStock(styleNo: string, metalType: string | null): Promise<string | null> {
  const candidates = await db.memo_stock.findMany({
    where: {
      Status: "active",
      Stock: { is: { StyleNo: styleNo } },
      Memo: {
        is: {
          IsActive: true,
          Client: { is: { IsStockPullAllowed: true } },
        },
      },
    },
    select: {
      StockNo: true,
      Stock: { select: { MetalType: true } },
    },
    orderBy: { StockNo: "asc" },
    take: 20,
  });

  const match = candidates.find((c) => matchesMetalType(c.Stock?.MetalType ?? null, metalType));
  return match?.StockNo ?? null;
}

async function rescanOpenItem(
  item: RescanItemRow,
  oldStatus: string,
): Promise<RescanItemOutcome> {
  const oldStockNo = item.StockNo;
  const styleNo = item.StyleNo;
  const metalType = extractMetalType(item.GroupValue);
  const clientId = item.ClientID;

  if (clientId) {
    const holdStockNo = await findOpenHoldStock(styleNo, clientId, metalType);
    if (holdStockNo) {
      const changed = oldStatus !== "hold" || oldStockNo !== holdStockNo;
      return {
        changed,
        oldStatus,
        newStatus: "hold",
        oldStockNo,
        newStockNo: holdStockNo,
      };
    }

    const memoStockNo = await findOpenMemoStock(styleNo, clientId, metalType);
    if (memoStockNo) {
      const changed = oldStatus !== "memo" || oldStockNo !== memoStockNo;
      return {
        changed,
        oldStatus,
        newStatus: "memo",
        oldStockNo,
        newStockNo: memoStockNo,
      };
    }
  }

  const warehouseStockNo = await findOpenWarehouseStock(styleNo, metalType);
  if (warehouseStockNo) {
    const changed = oldStatus !== "stock" || oldStockNo !== warehouseStockNo;
    return {
      changed,
      oldStatus,
      newStatus: "stock",
      oldStockNo,
      newStockNo: warehouseStockNo,
    };
  }

  const pullbackStockNo = await findOpenPullbackStock(styleNo, metalType);
  if (pullbackStockNo) {
    const changed = oldStatus !== "pullback_available" || oldStockNo !== pullbackStockNo;
    return {
      changed,
      oldStatus,
      newStatus: "pullback_available",
      oldStockNo,
      newStockNo: pullbackStockNo,
    };
  }

  return {
    changed: false,
    oldStatus,
    newStatus: "factory_order",
    oldStockNo,
    newStockNo: oldStockNo,
  };
}

async function rescanItem(item: RescanItemRow): Promise<RescanItemOutcome> {
  const oldStatus = item.Status;
  const oldStockNo = item.StockNo;

  if (oldStatus === "sold") {
    return { changed: false, oldStatus, newStatus: oldStatus, oldStockNo, newStockNo: oldStockNo };
  }

  if (LOCKED_STATUSES.has(oldStatus)) {
    return rescanLockedItem(item, oldStatus);
  }

  if (OPEN_STATUSES.has(oldStatus)) {
    return rescanOpenItem(item, oldStatus);
  }

  return { changed: false, oldStatus, newStatus: oldStatus, oldStockNo, newStockNo: oldStockNo };
}

async function loadItemsToRescan(
  body: z.infer<typeof bodySchema>,
): Promise<RescanItemRow[]> {
  const baseWhere: Prisma.replenishment_itemsWhereInput = {
    IsActive: true,
    Replenishment: { IsUndone: false },
    Status: { not: "sold" },
  };

  if ("itemIds" in body) {
    return db.replenishment_items.findMany({
      where: {
        IsActive: true,
        Replenishment: { IsUndone: false },
        ItemID: { in: body.itemIds },
      },
      select: ITEM_SELECT,
      orderBy: { ItemID: "asc" },
    });
  }

  if ("invoiceNo" in body) {
    return db.replenishment_items.findMany({
      where: { ...baseWhere, InvoiceNo: body.invoiceNo },
      select: ITEM_SELECT,
      orderBy: { ItemID: "asc" },
    });
  }

  if ("styleUploadRef" in body) {
    return db.replenishment_items.findMany({
      where: { ...baseWhere, StyleUploadRef: body.styleUploadRef },
      select: ITEM_SELECT,
      orderBy: { ItemID: "asc" },
    });
  }

  return db.replenishment_items.findMany({
    where: {
      ...baseWhere,
      ...(body.clientId ? { ClientID: body.clientId } : {}),
    },
    select: ITEM_SELECT,
    orderBy: { ItemID: "asc" },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.rescan");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const items = await loadItemsToRescan(parsed.data);
  if (items.length === 0) {
    return NextResponse.json(
      { message: "No eligible items found to rescan." },
      { status: 400 },
    );
  }

  const outcomes: Array<RescanItemOutcome & { item: RescanItemRow }> = [];
  for (const item of items) {
    const outcome = await rescanItem(item);
    outcomes.push({ ...outcome, item });
  }

  const now = new Date();
  const changedOutcomes = outcomes.filter((o) => o.changed);

  if (changedOutcomes.length > 0) {
    await db.$transaction(async (tx) => {
      for (const { item, newStatus, newStockNo, oldStatus } of changedOutcomes) {
        const resolvedStockNo = newStockNo ?? item.StockNo;

        await tx.replenishment_items.update({
          where: { ItemID: item.ItemID },
          data: {
            Status: newStatus,
            StockNo: resolvedStockNo,
            RescanCount: { increment: 1 },
            LastRescannedAt: now,
            LastRescannedBy: auth.userId,
          },
        });

        await tx.replenishment_status_log.create({
          data: {
            ItemID: item.ItemID,
            InvoiceNo: item.InvoiceNo,
            StyleNo: item.StyleNo,
            FromStatus: oldStatus,
            ToStatus: newStatus,
            ChangedBy: auth.userId,
            Notes: "Auto-updated by rescan",
          },
        });

        await tx.replenishment_rescan_log.create({
          data: {
            ItemID: item.ItemID,
            StyleUploadRef: item.StyleUploadRef,
            InvoiceNo: item.InvoiceNo,
            StyleNo: item.StyleNo,
            OldStatus: oldStatus,
            NewStatus: newStatus,
            OldStockNo: item.StockNo,
            NewStockNo: resolvedStockNo,
            ChangedBy: auth.userId,
            Notes: "Auto-updated by rescan",
          },
        });
      }
    });
  }

  const results = outcomes.map(({ item, changed, oldStatus, newStatus, oldStockNo, newStockNo }) => ({
    itemId: item.ItemID,
    styleNo: item.StyleNo,
    oldStatus,
    newStatus,
    oldStockNo,
    newStockNo,
    changed,
  }));

  return NextResponse.json({
    success: true,
    rescanned: results.length,
    changed: results.filter((r) => r.changed).length,
    results,
  });
}

/**
 * ERP sync logic — fetches data from ERP API and upserts into DB
 * Reuses existing memo lifecycle logic from upload route
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { invalidateConfigCache } from "@/lib/config";
import {
  fetchErpSales,
  fetchErpStock,
  getErpToken,
  parseMetalType,
  type ErpSaleRecord,
  type ErpStockRecord,
} from "@/lib/erp-api";
import { recalculateRankings } from "@/lib/rankings";
import type { MemoHeaderPayload } from "@/lib/memo-sync";
import {
  detachStaleActiveMemoLinks,
  ensureActiveMemoStockLink,
  upsertMemoHeaderByNo,
} from "@/lib/memo-sync";

export interface StockSyncResult {
  inserted: number;
  updated: number;
  markedSold: number;
  markedReturned: number;
  flaggedMissing: number;
  memosDeactivated: number;
  errors: string[];
  syncedAt: Date;
}

export interface SalesSyncResult {
  inserted: number;
  updated: number;
  clientsCreated: number;
  errors: string[];
  syncedAt: Date;
}

const STOCK_CHUNK_SIZE = 500;
const STOCK_PARALLEL_LIMIT = 5;
const MEMO_UPDATE_CHUNK = 500;
const MEMO_CREATE_CHUNK = 500;
const MEMO_LINK_CHUNK = 500;

type MemoRef = {
  MemoID: string;
  MemoNo: string;
  StockNo: string | null;
  IsActive: boolean;
  ClientID: string | null;
};

type PreloadedActiveLink = {
  MemoStockID: string;
  MemoID: string | null;
  StockNo: string | null;
  Memo: { MemoNo: string; IsActive: boolean } | null;
};

type PlannedMemoPayload = MemoHeaderPayload & {
  resolvedClientId: string | null;
  clientPendingKey: string | null;
  stockNoForCreate: string | null;
  stockNoBackfill: string | null;
};

type MappedStockRow = {
  StockNo: string;
  Location: string | null;
  Size: string | null;
  ProductType: string | null;
  StyleNo: string | null;
  ProductStyle: string | null;
  ProductDescription: string | null;
  StoneType: string | null;
  StoneShape: string | null;
  StoneWT: Prisma.Decimal | null;
  Quantity: Prisma.Decimal | null;
  StonePCs: Prisma.Decimal | null;
  MetalType: string | null;
  Metal: string | null;
  MetalPurity: string | null;
  MetalWT: Prisma.Decimal | null;
  StockValue: Prisma.Decimal | null;
  MemoPrice: Prisma.Decimal | null;
  MemoInvNo: string | null;
  HoldDate: Date | null;
  HoldNarration: string | null;
  HoldCompany: string | null;
  HoldSoldDate: Date | null;
  HoldSoldRemark: string | null;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function setSyncProgress(value: number): Promise<void> {
  await db.system_config.upsert({
    where: { ConfigKey: "erp_sync_progress" },
    create: {
      ConfigKey: "erp_sync_progress",
      ConfigValue: String(value),
      ConfigType: "integer",
      Module: "system",
      Description: "Current sync progress percentage 0-100",
    },
    update: { ConfigValue: String(value) },
  });
  invalidateConfigCache();
}

function isReturnedCandidateFromErp(record: ErpStockRecord): boolean {
  return !record.MEMO_DATE && !record.HOLD_DATE;
}

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  return value != null ? new Prisma.Decimal(value) : null;
}

function erpMemoTerms(record: ErpStockRecord): number {
  return record.MEMO_TERM && record.MEMO_TERM > 0 ? Math.trunc(record.MEMO_TERM) : 0;
}

function mapErpRecordToStockRow(record: ErpStockRecord): MappedStockRow {
  const { metal, purity } = parseMetalType(record.METAL_TYPE);
  return {
    StockNo: record.PROD_CODE.trim(),
    Location: record.LOCATION?.trim() ?? null,
    Size: record.PROD_SIZE?.trim() ?? null,
    ProductType: record.PROD_TYPE?.trim() ?? null,
    StyleNo: record.PROD_STYLE_CODE?.trim() ?? null,
    ProductStyle: record.PROD_STYLE?.trim() ?? null,
    ProductDescription: record.PROD_DESC?.trim() ?? null,
    StoneType: record.STONE_TYPES?.trim() ?? null,
    StoneShape: record.STONE_SHAPES?.trim() ?? null,
    StoneWT: toDecimal(record.STONE_WT),
    Quantity: record.QUANTITY ? new Prisma.Decimal(record.QUANTITY) : null,
    StonePCs: toDecimal(record.STONE_PCS),
    MetalType: record.METAL_TYPE?.trim() ?? null,
    Metal: metal,
    MetalPurity: purity,
    MetalWT: toDecimal(record.METAL_WT),
    StockValue: toDecimal(record.PROD_VAL),
    MemoPrice: toDecimal(record.MEMO_PRICE),
    MemoInvNo: record.MEMO_INV_NO?.trim() || null,
    HoldDate: record.HOLD_DATE ? new Date(record.HOLD_DATE) : null,
    HoldNarration: null,
    HoldCompany: record.HOLD_REMARK?.trim() ?? null,
    HoldSoldDate: record.HOLD_SOLD_DATE ? new Date(record.HOLD_SOLD_DATE) : null,
    HoldSoldRemark: record.HOLD_SOLD_REMARK?.trim() ?? null,
  };
}

async function bulkUpsertStockChunk(chunk: MappedStockRow[]): Promise<void> {
  if (chunk.length === 0) return;

  await db.$executeRaw`
    INSERT INTO stock (
      "StockNo", "Location", "Size", "ProductType",
      "StyleNo", "ProductStyle", "ProductDescription",
      "StoneType", "StoneShape", "StoneWT", "Quantity",
      "StonePCs", "MetalType", "Metal", "MetalPurity",
      "MetalWT", "StockValue", "MemoPrice", "MemoInvNo",
      "HoldDate", "HoldNarration", "HoldCompany",
      "HoldSoldDate", "HoldSoldRemark",
      "LastSyncedAt", "SyncSource"
    )
    VALUES ${Prisma.join(
      chunk.map(
        (row) => Prisma.sql`(
          ${row.StockNo}, ${row.Location}, ${row.Size},
          ${row.ProductType}, ${row.StyleNo}, ${row.ProductStyle},
          ${row.ProductDescription}, ${row.StoneType},
          ${row.StoneShape}, ${row.StoneWT}, ${row.Quantity},
          ${row.StonePCs}, ${row.MetalType}, ${row.Metal},
          ${row.MetalPurity}, ${row.MetalWT}, ${row.StockValue},
          ${row.MemoPrice}, ${row.MemoInvNo}, ${row.HoldDate}, ${row.HoldNarration},
          ${row.HoldCompany}, ${row.HoldSoldDate}, ${row.HoldSoldRemark},
          ${new Date()}, ${"api"}
        )`,
      ),
    )}
    ON CONFLICT ("StockNo") DO UPDATE SET
      "Location" = EXCLUDED."Location",
      "Size" = EXCLUDED."Size",
      "ProductType" = EXCLUDED."ProductType",
      "StyleNo" = EXCLUDED."StyleNo",
      "ProductStyle" = EXCLUDED."ProductStyle",
      "ProductDescription" = EXCLUDED."ProductDescription",
      "StoneType" = EXCLUDED."StoneType",
      "StoneShape" = EXCLUDED."StoneShape",
      "StoneWT" = EXCLUDED."StoneWT",
      "Quantity" = EXCLUDED."Quantity",
      "StonePCs" = EXCLUDED."StonePCs",
      "MetalType" = EXCLUDED."MetalType",
      "Metal" = EXCLUDED."Metal",
      "MetalPurity" = EXCLUDED."MetalPurity",
      "MetalWT" = EXCLUDED."MetalWT",
      "StockValue" = EXCLUDED."StockValue",
      "MemoPrice" = EXCLUDED."MemoPrice",
      "MemoInvNo" = EXCLUDED."MemoInvNo",
      "HoldDate" = EXCLUDED."HoldDate",
      "HoldNarration" = EXCLUDED."HoldNarration",
      "HoldCompany" = EXCLUDED."HoldCompany",
      "HoldSoldDate" = EXCLUDED."HoldSoldDate",
      "HoldSoldRemark" = EXCLUDED."HoldSoldRemark",
      "LastSyncedAt" = NOW(),
      "SyncSource" = 'api',
      "IsMissing" = false
  `;
}

async function applyBulkMemoLifecycle(
  uploadedStockNos: ReadonlySet<string>,
  lastRowByStockNo: ReadonlyMap<string, ErpStockRecord>,
  isReturnedCandidate: (row: ErpStockRecord) => boolean,
): Promise<Pick<StockSyncResult, "markedSold" | "markedReturned" | "flaggedMissing" | "memosDeactivated">> {
  const now = new Date();
  let markedSold = 0;
  let markedReturned = 0;
  let flaggedMissing = 0;
  let memosDeactivated = 0;

  const allActiveMemoStock = await db.memo_stock.findMany({
    where: { Status: "active", StockNo: { not: null } },
    select: { StockNo: true, MemoID: true, MemoStockID: true },
  });

  const missingItems = allActiveMemoStock.filter(
    (ms) => ms.StockNo != null && !uploadedStockNos.has(ms.StockNo),
  );

  const stockNosToCheck = missingItems
    .map((ms) => ms.StockNo as string)
    .filter(Boolean);

  const soldRecords =
    stockNosToCheck.length > 0
      ? await db.sales.findMany({
          where: { StockNo: { in: stockNosToCheck } },
          select: { StockNo: true, InvoiceNo: true },
        })
      : [];

  const soldMap = new Map<string, string>();
  for (const sale of soldRecords) {
    if (sale.StockNo && !soldMap.has(sale.StockNo)) {
      soldMap.set(sale.StockNo, sale.InvoiceNo);
    }
  }

  const soldItems = missingItems.filter((ms) => soldMap.has(ms.StockNo as string));
  const trulyMissingItems = missingItems.filter((ms) => !soldMap.has(ms.StockNo as string));

  const soldStockNos = soldItems.map((ms) => ms.StockNo as string);
  const missingStockNos = trulyMissingItems.map((ms) => ms.StockNo as string);

  if (soldStockNos.length > 0) {
    for (const soldChunk of chunkArray(soldStockNos, 500)) {
      await db.$executeRaw`
        UPDATE memo_stock SET
          "Status" = 'sold',
          "InvoiceNo" = CASE "StockNo"
            ${Prisma.join(
              soldChunk.map(
                (sn) => Prisma.sql`WHEN ${sn} THEN ${soldMap.get(sn) ?? null}`,
              ),
              " ",
            )}
            ELSE "InvoiceNo"
          END,
          "UpdatedAt" = ${now}
        WHERE "StockNo" IN (${Prisma.join(soldChunk)})
          AND "Status" = 'active'
      `;
    }
    markedSold = soldStockNos.length;
  }

  if (missingStockNos.length > 0) {
    for (const missingChunk of chunkArray(missingStockNos, 500)) {
      await db.memo_stock.updateMany({
        where: { StockNo: { in: missingChunk }, Status: "active" },
        data: {
          Status: "missing",
          StatusNote: "Missing from stock upload — manual review required",
          UpdatedAt: now,
        },
      });
      await db.stock.updateMany({
        where: { StockNo: { in: missingChunk } },
        data: { IsMissing: true, MissingNote: "Missing from stock upload" },
      });
    }
    flaggedMissing = missingStockNos.length;
  }

  const returnedCandidates: string[] = [];
  for (const [stockNo, row] of lastRowByStockNo) {
    if (isReturnedCandidate(row)) {
      returnedCandidates.push(stockNo);
    }
  }

  const memoIdsToCheck = new Set<string>();
  for (const ms of soldItems) {
    if (ms.MemoID) memoIdsToCheck.add(ms.MemoID);
  }

  if (returnedCandidates.length > 0) {
    const activeReturned = await db.memo_stock.findMany({
      where: { StockNo: { in: returnedCandidates }, Status: "active" },
      select: { MemoStockID: true, MemoID: true, StockNo: true },
    });

    if (activeReturned.length > 0) {
      await db.memo_stock.updateMany({
        where: { MemoStockID: { in: activeReturned.map((row) => row.MemoStockID) } },
        data: {
          Status: "returned",
          StatusNote: "Returned by client — detected via stock upload",
          UpdatedAt: now,
        },
      });
      markedReturned = activeReturned.length;
      for (const row of activeReturned) {
        if (row.MemoID) memoIdsToCheck.add(row.MemoID);
      }
    }
  }

  for (const memoId of memoIdsToCheck) {
    const remainingActive = await db.memo_stock.count({
      where: { MemoID: memoId, Status: "active" },
    });
    if (remainingActive === 0) {
      await db.memo.update({
        where: { MemoID: memoId },
        data: { IsActive: false },
      });
      memosDeactivated += 1;
    }
  }

  return { markedSold, markedReturned, flaggedMissing, memosDeactivated };
}

function erpMemoNo(record: ErpStockRecord): string | null {
  return record.MEMO_INV_NO?.trim() || null;
}

function memoNoKey(memoNo: string): string {
  return memoNo.toLowerCase().trim();
}

function erpPartyName(record: ErpStockRecord): string | null {
  return record.MEMO_PARTY_NAME?.trim() ?? record.MEMO_REMARK?.trim() ?? null;
}

function resolveClientForErpMemo(
  record: ErpStockRecord,
  clientCodeToId: Map<string, string>,
  clientNameToId: Map<string, string>,
  clientsPendingCreate: Map<string, { PartyName: string; PartyCode: string | null }>,
): { resolvedClientId: string | null; clientPendingKey: string | null } {
  const partyCode = record.MEMO_CODE?.trim() ?? null;
  const remarkName = record.MEMO_REMARK?.trim() ?? null;
  const partyName = erpPartyName(record);

  if (partyCode) {
    const byCode = clientCodeToId.get(partyCode);
    if (byCode) {
      return { resolvedClientId: byCode, clientPendingKey: null };
    }
  }

  if (remarkName) {
    const remarkKey = remarkName.toLowerCase();
    const byRemark = clientNameToId.get(remarkKey);
    if (byRemark) {
      return { resolvedClientId: byRemark, clientPendingKey: null };
    }
  }

  if (partyName && partyName !== remarkName) {
    const nameKey = partyName.toLowerCase();
    const byName = clientNameToId.get(nameKey);
    if (byName) {
      return { resolvedClientId: byName, clientPendingKey: null };
    }
  }

  const createName = partyName ?? remarkName ?? partyCode;
  if (!createName && !partyCode) {
    return { resolvedClientId: null, clientPendingKey: null };
  }

  const pendingKey = partyCode ? `code:${partyCode}` : `name:${createName!.toLowerCase()}`;
  if (!clientsPendingCreate.has(pendingKey)) {
    clientsPendingCreate.set(pendingKey, {
      PartyName: createName ?? partyCode!,
      PartyCode: partyCode,
    });
  }

  return { resolvedClientId: null, clientPendingKey: pendingKey };
}

async function bulkSyncMemosFromErpRecords(
  erpRecords: ErpStockRecord[],
  errors: string[],
): Promise<void> {
  const memoSyncStart = Date.now();
  const memoItems = erpRecords.filter(
    (r) => r.MEMO_DATE && r.MEMO_INV_NO?.trim() && erpMemoTerms(r) > 0,
  );
  const memoTotal = memoItems.length;
  console.log(`[ERP SYNC] ${memoTotal} items have memo data`);

  if (memoTotal === 0) {
    console.log(`[ERP SYNC] ✓ Memo sync completed in ${Date.now() - memoSyncStart}ms (nothing to sync)`);
    return;
  }

  const phase1Start = Date.now();

  const existingMemos = await db.memo.findMany({
    select: {
      MemoID: true,
      MemoNo: true,
      StockNo: true,
      IsActive: true,
      ClientID: true,
    },
  });

  const memoByNo = new Map<string, MemoRef>();
  const memoByStockNo = new Map<string, MemoRef>();
  for (const memo of existingMemos) {
    const key = memoNoKey(memo.MemoNo);
    if (!memoByNo.has(key)) {
      memoByNo.set(key, memo);
    }
    if (memo.StockNo) {
      if (!memoByStockNo.has(memo.StockNo)) {
        memoByStockNo.set(memo.StockNo, memo);
      }
    }
  }

  const existingActiveLinks = await db.memo_stock.findMany({
    where: { Status: "active" },
    include: { Memo: { select: { MemoNo: true, IsActive: true } } },
  });

  const activeLinksByStock = new Map<string, PreloadedActiveLink[]>();
  const activeLinksByMemoId = new Map<string, PreloadedActiveLink[]>();
  for (const link of existingActiveLinks) {
    if (link.MemoID) {
      const memoArr = activeLinksByMemoId.get(link.MemoID) ?? [];
      memoArr.push(link);
      activeLinksByMemoId.set(link.MemoID, memoArr);
    }
    if (link.StockNo) {
      const stockArr = activeLinksByStock.get(link.StockNo) ?? [];
      stockArr.push(link);
      activeLinksByStock.set(link.StockNo, stockArr);
    }
  }

  const existingClients = await db.clients.findMany({
    select: { ClientID: true, PartyName: true, PartyCode: true },
  });
  const clientNameToId = new Map(
    existingClients.map((c) => [c.PartyName.toLowerCase().trim(), c.ClientID]),
  );
  const clientCodeToId = new Map<string, string>();
  for (const client of existingClients) {
    const code = client.PartyCode?.trim();
    if (code) clientCodeToId.set(code, client.ClientID);
  }
  const clientPendingKeyToId = new Map<string, string>();

  console.log(
    `[MEMO SYNC] Phase 1 preload done in ${Date.now() - phase1Start}ms — ${existingMemos.length} memos, ${existingActiveLinks.length} active links, ${existingClients.length} clients`,
  );

  const phase2Start = Date.now();

  type MemoCreateRow = {
    MemoNo: string;
    payload: PlannedMemoPayload;
    stockNo: string | null;
  };
  type MemoUpdateRow = { MemoID: string; payload: PlannedMemoPayload };
  type LinkReturnRow = { MemoStockID: string; oldMemoID: string; currentMemoNo: string };

  const memosToCreateByNo = new Map<string, MemoCreateRow>();
  const memosToUpdateById = new Map<string, MemoUpdateRow>();
  const linksToReturnById = new Map<string, LinkReturnRow>();
  const memosToDeactivate = new Set<string>();
  const memoIdsClearStockNo = new Set<string>();
  const clientsPendingCreate = new Map<
    string,
    { PartyName: string; PartyCode: string | null }
  >();
  const linksNeeded = new Map<string, { memoNoKey: string; stockNo: string }>();

  const removeActiveLinkFromMemory = (link: PreloadedActiveLink) => {
    if (link.MemoID) {
      const memoLinks = activeLinksByMemoId.get(link.MemoID) ?? [];
      activeLinksByMemoId.set(
        link.MemoID,
        memoLinks.filter((l) => l.MemoStockID !== link.MemoStockID),
      );
    }
    if (link.StockNo) {
      const stockLinks = activeLinksByStock.get(link.StockNo) ?? [];
      activeLinksByStock.set(
        link.StockNo,
        stockLinks.filter((l) => l.MemoStockID !== link.MemoStockID),
      );
    }
  };

  const resolveClientKey = (record: ErpStockRecord) =>
    resolveClientForErpMemo(record, clientCodeToId, clientNameToId, clientsPendingCreate);

  let processed = 0;
  for (const record of memoItems) {
    const stockNo = record.PROD_CODE.trim();
    const memoDate = new Date(record.MEMO_DATE!);
    const terms = erpMemoTerms(record);
    const memoNo = erpMemoNo(record);
    if (!memoNo) continue;
    const noKey = memoNoKey(memoNo);
    const clientResolution = resolveClientKey(record);
    const memoEndDate = new Date(memoDate);
    memoEndDate.setDate(memoEndDate.getDate() + terms);

    const payload: PlannedMemoPayload = {
      MemoDate: memoDate,
      Terms: terms,
      MemoEndDate: memoEndDate,
      MemoNarration: record.MEMO_REMARK?.trim() ?? null,
      ClientID: null,
      resolvedClientId: clientResolution.resolvedClientId,
      clientPendingKey: clientResolution.clientPendingKey,
      IsActive: true,
      stockNoForCreate: null,
      stockNoBackfill: null,
    };

    const stockActiveLinks = activeLinksByStock.get(stockNo) ?? [];
    for (const activeLink of [...stockActiveLinks]) {
      const linkMemoNo = activeLink.Memo?.MemoNo;
      if (!linkMemoNo || memoNoKey(linkMemoNo) === noKey) {
        continue;
      }

      if (!linksToReturnById.has(activeLink.MemoStockID)) {
        linksToReturnById.set(activeLink.MemoStockID, {
          MemoStockID: activeLink.MemoStockID,
          oldMemoID: activeLink.MemoID!,
          currentMemoNo: memoNo,
        });
      }

      removeActiveLinkFromMemory(activeLink);

      const remaining = activeLinksByMemoId.get(activeLink.MemoID!) ?? [];
      if (remaining.length === 0) {
        memosToDeactivate.add(activeLink.MemoID!);
      }
    }

    const keyedMemo = memoByStockNo.get(stockNo);
    if (keyedMemo && memoNoKey(keyedMemo.MemoNo) !== noKey) {
      memoIdsClearStockNo.add(keyedMemo.MemoID);
    }

    const existingMemo = memoByNo.get(noKey);
    if (existingMemo) {
      memosToUpdateById.set(existingMemo.MemoID, {
        MemoID: existingMemo.MemoID,
        payload,
      });
    } else if (!memosToCreateByNo.has(noKey)) {
      memosToCreateByNo.set(noKey, {
        MemoNo: memoNo,
        payload,
        stockNo: null,
      });
    } else {
      const queued = memosToCreateByNo.get(noKey)!;
      queued.payload = payload;
      queued.stockNo = null;
    }

    const stillActiveForTarget = (activeLinksByStock.get(stockNo) ?? []).some(
      (link) => link.Memo?.MemoNo && memoNoKey(link.Memo.MemoNo) === noKey,
    );
    if (!stillActiveForTarget) {
      linksNeeded.set(`${noKey}\0${stockNo}`, { memoNoKey: noKey, stockNo });
    }

    processed += 1;
    if (processed % 500 === 0) {
      console.log(
        `[MEMO SYNC] Phase 2 planned ${processed}/${memoTotal} items in ${Date.now() - phase2Start}ms`,
      );
    }
  }

  const memosToCreate = [...memosToCreateByNo.values()];
  const memosToUpdate = [...memosToUpdateById.values()];
  const linksToReturn = [...linksToReturnById.values()];

  console.log(
    `[MEMO SYNC] Phase 2 planning done in ${Date.now() - phase2Start}ms — create=${memosToCreate.length} update=${memosToUpdate.length} returnLinks=${linksToReturn.length} newLinks=${linksNeeded.size} deactivate=${memosToDeactivate.size}`,
  );

  const phase3Start = Date.now();
  const now = new Date();

  const runPhase = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      errors.push(`${label} failed: ${err}`);
      console.error(`[MEMO SYNC] ${label} failed:`, err);
    }
  };

  const resolvePayloadClientId = (payload: PlannedMemoPayload): MemoHeaderPayload => {
    const clientId =
      payload.resolvedClientId ??
      (payload.clientPendingKey
        ? (clientPendingKeyToId.get(payload.clientPendingKey) ?? null)
        : null);
    return {
      MemoDate: payload.MemoDate,
      Terms: payload.Terms,
      MemoEndDate: payload.MemoEndDate,
      MemoNarration: payload.MemoNarration,
      ClientID: clientId,
      IsActive: payload.IsActive,
    };
  };

  await runPhase("Phase 3a clients", async () => {
    if (clientsPendingCreate.size === 0) return;
    const clientRows = [...clientsPendingCreate.values()];
    await db.clients.createMany({ data: clientRows, skipDuplicates: true });
    for (const [pendingKey, row] of clientsPendingCreate.entries()) {
      let found: { ClientID: string } | null = null;
      if (row.PartyCode) {
        found = await db.clients.findUnique({
          where: { PartyCode: row.PartyCode },
          select: { ClientID: true },
        });
        if (found) {
          clientCodeToId.set(row.PartyCode, found.ClientID);
        }
      }
      if (!found) {
        found = await db.clients.findFirst({
          where: { PartyName: { equals: row.PartyName, mode: "insensitive" } },
          select: { ClientID: true },
        });
      }
      if (found) {
        clientNameToId.set(row.PartyName.toLowerCase().trim(), found.ClientID);
        clientPendingKeyToId.set(pendingKey, found.ClientID);
      }
    }
    console.log(
      `[MEMO SYNC] Phase 3a clients created/cached ${clientRows.length} in ${Date.now() - phase3Start}ms`,
    );
  });

  await runPhase("Phase 3b return stale links", async () => {
    if (linksToReturn.length === 0) return;
    for (const chunk of chunkArray(linksToReturn, MEMO_LINK_CHUNK)) {
      await db.memo_stock.updateMany({
        where: { MemoStockID: { in: chunk.map((l) => l.MemoStockID) } },
        data: {
          Status: "returned",
          StatusNote: "Replaced by sync",
          UpdatedAt: now,
        },
      });
    }
    console.log(
      `[MEMO SYNC] Phase 3b returned ${linksToReturn.length} stale links in ${Date.now() - phase3Start}ms`,
    );
  });

  await runPhase("Phase 3c deactivate memos", async () => {
    if (memosToDeactivate.size === 0) return;
    await db.memo.updateMany({
      where: { MemoID: { in: [...memosToDeactivate] } },
      data: { IsActive: false },
    });
    console.log(
      `[MEMO SYNC] Phase 3c deactivated ${memosToDeactivate.size} memos in ${Date.now() - phase3Start}ms`,
    );
  });

  await runPhase("Phase 3d clear StockNo", async () => {
    if (memoIdsClearStockNo.size === 0) return;
    await db.memo.updateMany({
      where: { MemoID: { in: [...memoIdsClearStockNo] } },
      data: { StockNo: null },
    });
    console.log(
      `[MEMO SYNC] Phase 3d cleared StockNo on ${memoIdsClearStockNo.size} memos in ${Date.now() - phase3Start}ms`,
    );
  });

  await runPhase("Phase 3e update memo headers", async () => {
    if (memosToUpdate.length === 0) return;
    const withBackfill = memosToUpdate.filter((m) => m.payload.stockNoBackfill);
    if (withBackfill.length > 0) {
      for (const chunk of chunkArray(withBackfill, MEMO_UPDATE_CHUNK)) {
        await db.$executeRaw`
          UPDATE memo SET "StockNo" = v."stockNo"
          FROM (VALUES ${Prisma.join(
            chunk.map(
              (m) =>
                Prisma.sql`(${m.MemoID}::uuid, ${m.payload.stockNoBackfill!})`,
            ),
          )}) AS v("memoId", "stockNo")
          WHERE memo."MemoID" = v."memoId"
        `;
      }
    }

    for (let i = 0; i < memosToUpdate.length; i += MEMO_UPDATE_CHUNK) {
      const chunk = memosToUpdate.slice(i, i + MEMO_UPDATE_CHUNK);
      await db.$executeRaw`
        UPDATE memo SET
          "MemoDate" = v."memoDate"::date,
          "MemoEndDate" = v."memoEndDate"::date,
          "Terms" = v."terms"::int,
          "MemoNarration" = v."memoNarration",
          "ClientID" = v."clientId"::uuid,
          "IsActive" = true
        FROM (VALUES ${Prisma.join(
          chunk.map((m) => {
            const resolved = resolvePayloadClientId(m.payload);
            return Prisma.sql`(
              ${m.MemoID}::uuid,
              ${resolved.MemoDate}::date,
              ${resolved.MemoEndDate}::date,
              ${resolved.Terms}::int,
              ${resolved.MemoNarration},
              ${resolved.ClientID}::uuid
            )`;
          }),
        )}) AS v("memoId", "memoDate", "memoEndDate", "terms", "memoNarration", "clientId")
        WHERE memo."MemoID" = v."memoId"
      `;
    }
    console.log(
      `[MEMO SYNC] Phase 3e updated ${memosToUpdate.length} memo headers in ${Date.now() - phase3Start}ms`,
    );
  });

  await runPhase("Phase 3f create memo headers", async () => {
    if (memosToCreate.length === 0) return;
    for (let i = 0; i < memosToCreate.length; i += MEMO_CREATE_CHUNK) {
      const chunk = memosToCreate.slice(i, i + MEMO_CREATE_CHUNK);
      await db.memo.createMany({
        data: chunk.map((m) => {
          const resolved = resolvePayloadClientId(m.payload);
          return {
            MemoNo: m.MemoNo,
            ...resolved,
            ...(m.stockNo ? { StockNo: m.stockNo } : {}),
          };
        }),
        skipDuplicates: true,
      });
    }
    console.log(
      `[MEMO SYNC] Phase 3f created ${memosToCreate.length} memo headers in ${Date.now() - phase3Start}ms`,
    );
  });

  await runPhase("Phase 3g create memo_stock links", async () => {
    const createMemoNos = memosToCreate.map((m) => m.MemoNo);
    const newlyCreatedMemos =
      createMemoNos.length > 0
        ? await db.memo.findMany({
            where: { MemoNo: { in: createMemoNos } },
            select: { MemoID: true, MemoNo: true, StockNo: true, IsActive: true, ClientID: true },
          })
        : [];

    for (const memo of newlyCreatedMemos) {
      const key = memoNoKey(memo.MemoNo);
      if (!memoByNo.has(key)) {
        memoByNo.set(key, memo);
      }
    }

    const linksToCreate: Array<{ MemoID: string; StockNo: string; Status: string }> = [];
    const linkDedupe = new Set<string>();
    for (const { memoNoKey: linkNoKey, stockNo } of linksNeeded.values()) {
      const memoEntry = memoByNo.get(linkNoKey);
      if (!memoEntry) continue;
      const dedupeKey = `${memoEntry.MemoID}\0${stockNo}`;
      if (linkDedupe.has(dedupeKey)) continue;
      linkDedupe.add(dedupeKey);
      linksToCreate.push({
        MemoID: memoEntry.MemoID,
        StockNo: stockNo,
        Status: "active",
      });
    }

    if (linksToCreate.length === 0) return;

    for (let i = 0; i < linksToCreate.length; i += MEMO_LINK_CHUNK) {
      const chunk = linksToCreate.slice(i, i + MEMO_LINK_CHUNK);
      await db.memo_stock.createMany({ data: chunk, skipDuplicates: true });
    }
    console.log(
      `[MEMO SYNC] Phase 3g created ${linksToCreate.length} memo_stock links in ${Date.now() - phase3Start}ms`,
    );
  });

  console.log(
    `[MEMO SYNC] Phase 3 bulk writes done in ${Date.now() - phase3Start}ms`,
  );
  console.log(`[ERP SYNC] ✓ Memo sync completed in ${Date.now() - memoSyncStart}ms`);
}

export async function syncStockFromErp(remoteAddress?: string): Promise<StockSyncResult> {
  const syncStart = Date.now();
  console.log(`[ERP SYNC] Starting stock sync at ${new Date().toISOString()}`);

  const result: StockSyncResult = {
    inserted: 0,
    updated: 0,
    markedSold: 0,
    markedReturned: 0,
    flaggedMissing: 0,
    memosDeactivated: 0,
    errors: [],
    syncedAt: new Date(),
  };

  await setSyncProgress(0);

  try {
    const authStart = Date.now();
    await getErpToken(remoteAddress);
    console.log(`[ERP SYNC] ✓ Auth completed in ${Date.now() - authStart}ms`);

    const fetchStart = Date.now();
    const erpRecords = await fetchErpStock(remoteAddress);
    if (!erpRecords.length) {
      result.errors.push("ERP returned empty stock data");
      await db.system_config.update({
        where: { ConfigKey: "erp_last_stock_sync" },
        data: { ConfigValue: new Date().toISOString() },
      });
      invalidateConfigCache();
      return result;
    }
    console.log(
      `[ERP SYNC] ✓ Fetched ${erpRecords.length} records from ERP in ${Date.now() - fetchStart}ms`,
    );

    const uploadedStockNos = new Set(erpRecords.map((r) => r.PROD_CODE.trim()));
    const lastRowByStockNo = new Map<string, ErpStockRecord>();
    for (const record of erpRecords) {
      lastRowByStockNo.set(record.PROD_CODE.trim(), record);
    }

    const mapStart = Date.now();
    const mappedRows = [...lastRowByStockNo.values()].map(mapErpRecordToStockRow);
    console.log(
      `[ERP SYNC] ✓ Mapped ${mappedRows.length} records in ${Date.now() - mapStart}ms`,
    );

    const upsertStart = Date.now();
    const totalRows = mappedRows.length;
    const chunks = chunkArray(mappedRows, STOCK_CHUNK_SIZE);
    console.log(
      `[ERP SYNC] Starting bulk upsert: ${totalRows} rows in ${chunks.length} chunks of ${STOCK_CHUNK_SIZE}`,
    );

    let processedRows = 0;
    for (let i = 0; i < chunks.length; i += STOCK_PARALLEL_LIMIT) {
      const batchStart = Date.now();
      const batch = chunks.slice(i, i + STOCK_PARALLEL_LIMIT);
      const outcomes = await Promise.allSettled(batch.map((chunk) => bulkUpsertStockChunk(chunk)));

      for (let j = 0; j < outcomes.length; j++) {
        const outcome = outcomes[j];
        if (outcome.status === "fulfilled") {
          result.updated += batch[j]?.length ?? 0;
        } else {
          result.errors.push(`Bulk upsert chunk failed: ${outcome.reason}`);
        }
      }

      processedRows += batch.reduce((sum, chunk) => sum + chunk.length, 0);
      const pct = Math.round((processedRows / totalRows) * 100);
      console.log(
        `[ERP SYNC] Batch ${Math.floor(i / STOCK_PARALLEL_LIMIT) + 1}/${Math.ceil(chunks.length / STOCK_PARALLEL_LIMIT)} done in ${Date.now() - batchStart}ms — ${processedRows}/${totalRows} rows (${pct}%)`,
      );

      await setSyncProgress(pct);
    }
    console.log(`[ERP SYNC] ✓ Bulk upsert completed in ${Date.now() - upsertStart}ms`);

    const memoStart = Date.now();
    console.log(`[ERP SYNC] Starting memo lifecycle pass...`);
    const lifecycleResult = await applyBulkMemoLifecycle(
      uploadedStockNos,
      lastRowByStockNo,
      isReturnedCandidateFromErp,
    );
    result.markedSold = lifecycleResult.markedSold;
    result.markedReturned = lifecycleResult.markedReturned;
    result.flaggedMissing = lifecycleResult.flaggedMissing;
    result.memosDeactivated = lifecycleResult.memosDeactivated;
    console.log(`[ERP SYNC] ✓ Memo lifecycle completed in ${Date.now() - memoStart}ms`);
    console.log(
      `[ERP SYNC]   sold=${result.markedSold} returned=${result.markedReturned} missing=${result.flaggedMissing} memosDeactivated=${result.memosDeactivated}`,
    );

    console.log(`[ERP SYNC] Starting memo creation for items with MEMO_DATE...`);
    await bulkSyncMemosFromErpRecords(erpRecords, result.errors);

    const configStart = Date.now();
    await db.system_config.update({
      where: { ConfigKey: "erp_last_stock_sync" },
      data: { ConfigValue: new Date().toISOString() },
    });
    invalidateConfigCache();
    console.log(`[ERP SYNC] ✓ Config updated in ${Date.now() - configStart}ms`);

    await setSyncProgress(100);

    const totalTime = Date.now() - syncStart;
    console.log(
      `[ERP SYNC] ✅ COMPLETE — Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`,
    );
    console.log(
      `[ERP SYNC] Summary: inserted=${result.inserted} updated=${result.updated}`,
    );

    return result;
  } catch (err) {
    await setSyncProgress(-1);
    console.error(`[ERP SYNC] ❌ FAILED after ${Date.now() - syncStart}ms:`, err);
    throw err;
  }
}

/**
 * Create/update memo record from ERP stock record (single-item path; bulk sync uses bulkSyncMemosFromErpRecords).
 * MEMO_CODE = client PartyCode; MEMO_INV_NO = memo invoice number (MemoNo).
 */
export async function syncMemoFromErpRecord(
  record: ErpStockRecord,
  stockNo: string,
): Promise<void> {
  const terms = erpMemoTerms(record);
  if (!record.MEMO_DATE || !record.MEMO_INV_NO?.trim() || terms === 0) {
    return;
  }

  const memoNo = erpMemoNo(record);
  if (!memoNo) return;

  const memoDate = new Date(record.MEMO_DATE);
  const memoEndDate = new Date(memoDate);
  memoEndDate.setDate(memoEndDate.getDate() + terms);

  let clientId: string | null = null;
  const partyCode = record.MEMO_CODE?.trim() ?? null;
  const remarkName = record.MEMO_REMARK?.trim() ?? null;
  const partyName = erpPartyName(record);

  if (partyCode) {
    const byCode = await db.clients.findUnique({
      where: { PartyCode: partyCode },
      select: { ClientID: true },
    });
    if (byCode) clientId = byCode.ClientID;
  }

  if (!clientId && remarkName) {
    const byRemark = await db.clients.findFirst({
      where: { PartyName: { equals: remarkName, mode: "insensitive" } },
      select: { ClientID: true },
    });
    if (byRemark) clientId = byRemark.ClientID;
  }

  if (!clientId && partyName && partyName !== remarkName) {
    const byName = await db.clients.findFirst({
      where: { PartyName: { equals: partyName, mode: "insensitive" } },
      select: { ClientID: true },
    });
    if (byName) clientId = byName.ClientID;
  }

  if (!clientId && (partyName || remarkName || partyCode)) {
    const newClient = await db.clients.create({
      data: {
        PartyName: partyName ?? remarkName ?? partyCode!,
        PartyCode: partyCode,
      },
    });
    clientId = newClient.ClientID;
  }

  const memoPayload = {
    MemoDate: memoDate,
    Terms: terms,
    MemoEndDate: memoEndDate,
    MemoNarration: record.MEMO_REMARK?.trim() ?? null,
    ClientID: clientId,
    IsActive: true,
  };

  await detachStaleActiveMemoLinks(stockNo, memoNo);

  const memo = await upsertMemoHeaderByNo(memoNo, memoPayload, null);

  await ensureActiveMemoStockLink(memo.MemoID, stockNo);
}

async function resolveClientForSale(
  record: ErpSaleRecord,
): Promise<{ clientId: string | null; created: boolean }> {
  const partyCode = record.PARTY_CODE?.trim() ?? null;
  const partyName = record.PARTY_NAME?.trim() ?? null;

  if (!partyCode && !partyName) {
    return { clientId: null, created: false };
  }

  if (partyCode) {
    const byCode = await db.clients.findUnique({
      where: { PartyCode: partyCode },
      select: { ClientID: true },
    });
    if (byCode) {
      return { clientId: byCode.ClientID, created: false };
    }
  }

  if (partyName) {
    const byName = await db.clients.findFirst({
      where: { PartyName: { equals: partyName, mode: "insensitive" } },
      select: { ClientID: true },
    });
    if (byName) {
      return { clientId: byName.ClientID, created: false };
    }
  }

  const created = await db.clients.create({
    data: {
      PartyCode: partyCode,
      PartyName: partyName ?? partyCode ?? "Unknown Client",
    },
    select: { ClientID: true },
  });
  return { clientId: created.ClientID, created: true };
}

async function ensureStocksExistForSalesSync(stockNos: string[]) {
  const unique = [...new Set(stockNos.filter(Boolean))];
  if (unique.length === 0) return;

  const found = await db.stock.findMany({
    where: { StockNo: { in: unique } },
    select: { StockNo: true },
  });
  const have = new Set(found.map((s) => s.StockNo));
  const missing = unique.filter((sn) => !have.has(sn));
  if (missing.length === 0) return;

  await db.stock.createMany({
    data: missing.map((StockNo) => ({ StockNo })),
    skipDuplicates: true,
  });
}

function salesUpsertData(
  record: ErpSaleRecord,
  clientId: string | null,
) {
  const { metal, purity } = parseMetalType(record.METAL_TYPE);
  return {
    InvoiceNo: record.INVOICE_NO.trim(),
    InvoiceDate: new Date(record.INV_DATE),
    StockNo: record.PROD_CODE.trim(),
    Department: record.LOCATION?.trim() ?? null,
    StyleNo: record.PROD_STYLE_CODE?.trim() ?? null,
    ProductType: record.PROD_TYPE?.trim() ?? null,
    ProductStyle: record.PROD_STYLE?.trim() ?? null,
    StoneType: record.STONE_TYPES?.trim() ?? null,
    STShapes: record.STONE_SHAPES?.trim() ?? null,
    StoneWT: toDecimal(record.STONE_WT),
    StonePCs: toDecimal(record.STONE_PCS),
    MetalType: record.METAL_TYPE?.trim() ?? null,
    Metal: metal,
    MetalPurity: purity,
    MetalWT: toDecimal(record.METAL_WT),
    SaleValue: toDecimal(record.PROD_VAL),
    CRAmount: toDecimal(record.CR_AMT),
    PartyCode: record.PARTY_CODE?.trim() ?? null,
    PartyName: record.PARTY_NAME?.trim() ?? null,
    ClientID: clientId,
    SyncSource: "api" as const,
  };
}

export async function syncSalesFromErp(remoteAddress?: string): Promise<SalesSyncResult> {
  const result: SalesSyncResult = {
    inserted: 0,
    updated: 0,
    clientsCreated: 0,
    errors: [],
    syncedAt: new Date(),
  };

  const erpRecords = await fetchErpSales(remoteAddress);
  if (!erpRecords.length) {
    result.errors.push("ERP returned empty sales data");
    await db.system_config.update({
      where: { ConfigKey: "erp_last_sales_sync" },
      data: { ConfigValue: new Date().toISOString() },
    });
    invalidateConfigCache();
    return result;
  }

  const stockNos = erpRecords.map((r) => r.PROD_CODE.trim()).filter(Boolean);
  await ensureStocksExistForSalesSync(stockNos);

  const invoiceNos = [...new Set(erpRecords.map((r) => r.INVOICE_NO.trim()))];
  const existing = await db.sales.findMany({
    where: {
      InvoiceNo: { in: invoiceNos },
      StockNo: { in: stockNos },
    },
    select: { InvoiceNo: true, StockNo: true },
  });
  const existingSet = new Set(
    existing.map((row) => `${row.InvoiceNo}__${row.StockNo ?? ""}`),
  );

  for (const record of erpRecords) {
    const invoiceNo = record.INVOICE_NO.trim();
    const stockNo = record.PROD_CODE.trim();
    const dedupeKey = `${invoiceNo}__${stockNo}`;

    try {
      const { clientId, created } = await resolveClientForSale(record);
      if (created) {
        result.clientsCreated += 1;
      }

      const data = salesUpsertData(record, clientId);
      const wasExisting = existingSet.has(dedupeKey);

      await db.sales.upsert({
        where: {
          InvoiceNo_StockNo: {
            InvoiceNo: invoiceNo,
            StockNo: stockNo,
          },
        },
        create: data,
        update: {
          ...data,
          UploadedAt: new Date(),
        },
      });

      existingSet.add(dedupeKey);
      if (wasExisting) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    } catch (err) {
      result.errors.push(`Failed to upsert ${invoiceNo}/${stockNo}: ${err}`);
    }
  }

  recalculateRankings().catch((err) => {
    console.error("[rankings] recalculateRankings failed after ERP sales sync:", err);
  });

  await db.system_config.update({
    where: { ConfigKey: "erp_last_sales_sync" },
    data: { ConfigValue: new Date().toISOString() },
  });
  invalidateConfigCache();

  return result;
}

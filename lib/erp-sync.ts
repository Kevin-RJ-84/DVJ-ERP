/**
 * ERP sync logic — fetches data from ERP API and upserts into DB
 * Reuses existing memo lifecycle logic from upload route
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchErpStock, parseMetalType, type ErpStockRecord } from "@/lib/erp-api";
import { applyStockUploadMemoLifecyclePasses } from "@/lib/stock-lifecycle";

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

function isReturnedCandidateFromErp(record: ErpStockRecord): boolean {
  return !record.MEMO_DATE && !record.HOLD_DATE;
}

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  return value != null ? new Prisma.Decimal(value) : null;
}

export async function syncStockFromErp(): Promise<StockSyncResult> {
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

  // 1. Fetch from ERP
  const erpRecords = await fetchErpStock();
  if (!erpRecords.length) {
    throw new Error("ERP returned empty stock data");
  }

  const uploadedStockNos = new Set(erpRecords.map((r) => r.PROD_CODE.trim()));
  const lastRowByStockNo = new Map<string, ErpStockRecord>();
  for (const record of erpRecords) {
    lastRowByStockNo.set(record.PROD_CODE.trim(), record);
  }

  // 2. Upsert each stock record
  for (const record of erpRecords) {
    const stockNo = record.PROD_CODE.trim();
    const { metal, purity } = parseMetalType(record.METAL_TYPE);

    try {
      await db.stock.upsert({
        where: { StockNo: stockNo },
        create: {
          StockNo: stockNo,
          Location: record.LOCATION?.trim() ?? null,
          Size: record.PROD_SIZE?.trim() ?? null,
          ProductType: record.PROD_TYPE?.trim() ?? null,
          StyleNo: record.PROD_STYLE_CODE?.trim() ?? null,
          ProductStyle: record.PROD_STYLE?.trim() ?? null,
          StoneType: record.STONE_TYPES?.trim() ?? null,
          StoneShape: record.STONE_SHAPES?.trim() ?? null,
          StoneWT: toDecimal(record.STONE_WT),
          StonePCs: toDecimal(record.STONE_PCS),
          MetalType: record.METAL_TYPE?.trim() ?? null,
          Metal: metal,
          MetalPurity: purity,
          MetalWT: toDecimal(record.METAL_WT),
          StockValue: toDecimal(record.PROD_VAL),
          HoldDate: record.HOLD_DATE ? new Date(record.HOLD_DATE) : null,
          HoldNarration: record.HOLD_REMARK?.trim() ?? null,
          HoldSoldDate: record.HOLD_SOLD_DATE ? new Date(record.HOLD_SOLD_DATE) : null,
          HoldSoldRemark: record.HOLD_SOLD_REMARK?.trim() ?? null,
          LastSyncedAt: new Date(),
          SyncSource: "api",
        },
        update: {
          Location: record.LOCATION?.trim() ?? null,
          Size: record.PROD_SIZE?.trim() ?? null,
          ProductType: record.PROD_TYPE?.trim() ?? null,
          StyleNo: record.PROD_STYLE_CODE?.trim() ?? null,
          ProductStyle: record.PROD_STYLE?.trim() ?? null,
          StoneType: record.STONE_TYPES?.trim() ?? null,
          StoneShape: record.STONE_SHAPES?.trim() ?? null,
          StoneWT: toDecimal(record.STONE_WT),
          StonePCs: toDecimal(record.STONE_PCS),
          MetalType: record.METAL_TYPE?.trim() ?? null,
          Metal: metal,
          MetalPurity: purity,
          MetalWT: toDecimal(record.METAL_WT),
          StockValue: toDecimal(record.PROD_VAL),
          HoldDate: record.HOLD_DATE ? new Date(record.HOLD_DATE) : null,
          HoldNarration: record.HOLD_REMARK?.trim() ?? null,
          HoldSoldDate: record.HOLD_SOLD_DATE ? new Date(record.HOLD_SOLD_DATE) : null,
          HoldSoldRemark: record.HOLD_SOLD_REMARK?.trim() ?? null,
          LastSyncedAt: new Date(),
          SyncSource: "api",
          IsMissing: false,
        },
      });
      result.updated++;
    } catch (err) {
      result.errors.push(`Failed to upsert ${stockNo}: ${err}`);
    }
  }

  // 3. Run memo lifecycle (same logic as Excel upload)
  const lifecycleResult = await applyStockUploadMemoLifecyclePasses(
    uploadedStockNos,
    lastRowByStockNo,
    isReturnedCandidateFromErp,
  );
  result.markedSold = lifecycleResult.markedSold;
  result.markedReturned = lifecycleResult.markedReturned;
  result.flaggedMissing = lifecycleResult.flaggedMissing;
  result.memosDeactivated = lifecycleResult.memosDeactivated;

  // 4. Handle memo creation for items with MEMO_DATE
  for (const record of erpRecords) {
    const stockNo = record.PROD_CODE.trim();
    if (record.MEMO_DATE) {
      await syncMemoFromErpRecord(record, stockNo);
    }
  }

  // 5. Update last sync timestamp in config
  await db.system_config.update({
    where: { ConfigKey: "erp_last_stock_sync" },
    data: { ConfigValue: new Date().toISOString() },
  });

  return result;
}

/**
 * Create/update memo record from ERP stock record
 * MEMO_PARTY_CODE/MEMO_PARTY_NAME used when available
 * Falls back to MEMO_REMARK for client matching until API adds dedicated fields
 */
export async function syncMemoFromErpRecord(
  record: ErpStockRecord,
  stockNo: string,
): Promise<void> {
  const memoDate = new Date(record.MEMO_DATE!);

  // Get terms — use dedicated field when available, else default
  const terms = record.MEMO_TERMS_DAYS ?? 30;
  const memoEndDate = new Date(memoDate);
  memoEndDate.setDate(memoEndDate.getDate() + terms);

  // Find client — use party code/name when available
  // Fall back to MEMO_REMARK for now
  let clientId: string | null = null;

  const partyName =
    record.MEMO_PARTY_NAME?.trim() ?? record.MEMO_REMARK?.trim() ?? null;

  if (partyName) {
    const client = await db.clients.findFirst({
      where: { PartyName: { equals: partyName, mode: "insensitive" } },
    });
    if (client) {
      clientId = client.ClientID;
    } else {
      const newClient = await db.clients.create({
        data: {
          PartyName: partyName,
          PartyCode: record.MEMO_PARTY_CODE?.trim() ?? null,
        },
      });
      clientId = newClient.ClientID;
    }
  }

  const memoNo = `ERP-${stockNo}-${memoDate.toISOString().split("T")[0]}`;

  await db.memo.upsert({
    where: { MemoNo: memoNo },
    create: {
      MemoNo: memoNo,
      MemoDate: memoDate,
      Terms: terms,
      MemoEndDate: memoEndDate,
      MemoNarration: record.MEMO_REMARK?.trim() ?? null,
      ClientID: clientId,
      StockNo: stockNo,
      IsActive: true,
    },
    update: {
      Terms: terms,
      MemoEndDate: memoEndDate,
      MemoNarration: record.MEMO_REMARK?.trim() ?? null,
      ClientID: clientId,
    },
  });
}

import { db } from "@/lib/db";

export type StockMemoLifecycleResult = {
  markedSold: number;
  markedReturned: number;
  flaggedMissing: number;
  memosDeactivated: number;
};

export type UploadStockLifecycleRow = {
  Company: string | null;
  MemoNo: string | null;
  MemoDate: Date | null;
};

export function isReturnedCandidateFromUpload(row: UploadStockLifecycleRow): boolean {
  if (row.Company || row.MemoNo) {
    return false;
  }
  // Row still keys a stock-only memo (MemoDate without MemoNo) — not "back in warehouse".
  if (row.MemoDate) {
    return false;
  }
  return true;
}

/**
 * After all stock upserts, before memo link sync: detect sold / missing (active memo lines absent
 * from upload) and returned (upload row indicates item is back in warehouse).
 *
 * IMPORTANT: Never delete `stock` rows — only memo_stock status fields and memo / stock flags are updated here.
 */
export async function applyStockUploadMemoLifecyclePasses<T>(
  uploadedStockNos: ReadonlySet<string>,
  lastRowByStockNo: ReadonlyMap<string, T>,
  isReturnedCandidate: (row: T) => boolean,
): Promise<StockMemoLifecycleResult> {
  const now = new Date();
  let markedSold = 0;
  let markedReturned = 0;
  let flaggedMissing = 0;
  let memosDeactivated = 0;

  const activeNotInUpload = await db.memo_stock.findMany({
    where: {
      Status: "active",
      StockNo: { not: null },
    },
    select: { MemoStockID: true, MemoID: true, StockNo: true },
  });
  const missingItems = activeNotInUpload.filter(
    (ms) => ms.StockNo != null && !uploadedStockNos.has(ms.StockNo),
  );

  for (const ms of missingItems) {
    const stockNo = ms.StockNo as string;
    const saleRecord = await db.sales.findFirst({
      where: { StockNo: stockNo },
      select: { InvoiceNo: true },
    });

    if (saleRecord) {
      await db.memo_stock.update({
        where: { MemoStockID: ms.MemoStockID },
        data: {
          Status: "sold",
          InvoiceNo: saleRecord.InvoiceNo,
          UpdatedAt: now,
        },
      });
      markedSold += 1;

      if (ms.MemoID) {
        const remainingActive = await db.memo_stock.count({
          where: { MemoID: ms.MemoID, Status: "active" },
        });
        if (remainingActive === 0) {
          await db.memo.update({
            where: { MemoID: ms.MemoID },
            data: { IsActive: false },
          });
          memosDeactivated += 1;
        }
      }
    } else {
      await db.memo_stock.update({
        where: { MemoStockID: ms.MemoStockID },
        data: {
          Status: "missing",
          StatusNote: "Missing from stock upload — not found in sales. Manual review required.",
          UpdatedAt: now,
        },
      });
      flaggedMissing += 1;

      await db.stock.update({
        where: { StockNo: stockNo },
        data: { IsMissing: true, MissingNote: "Missing from stock upload" },
      });

      // Do not auto-deactivate memo when classified missing (manual review).
    }
  }

  for (const [stockNo, row] of lastRowByStockNo) {
    if (!isReturnedCandidate(row)) {
      continue;
    }

    const activeMemoStock = await db.memo_stock.findFirst({
      where: { StockNo: stockNo, Status: "active" },
    });

    if (!activeMemoStock) {
      continue;
    }

    await db.memo_stock.update({
      where: { MemoStockID: activeMemoStock.MemoStockID },
      data: {
        Status: "returned",
        StatusNote: "Returned by client — detected via stock upload",
        UpdatedAt: now,
      },
    });
    markedReturned += 1;

    const memoID = activeMemoStock.MemoID;
    if (memoID) {
      const remainingActive = await db.memo_stock.count({
        where: { MemoID: memoID, Status: "active" },
      });
      if (remainingActive === 0) {
        await db.memo.update({
          where: { MemoID: memoID },
          data: { IsActive: false },
        });
        memosDeactivated += 1;
      }
    }
  }

  return { markedSold, markedReturned, flaggedMissing, memosDeactivated };
}

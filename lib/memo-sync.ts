/**
 * Shared memo header + stock-link helpers for ERP sync and Excel upload.
 * Avoids prisma.memo.upsert() — handles case-insensitive MemoNo matches and P2002 races.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type MemoHeaderPayload = {
  MemoDate: Date;
  Terms: number;
  MemoEndDate: Date;
  MemoNarration: string | null;
  ClientID: string | null;
  IsActive: boolean;
};

function isMemoUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function findMemoByNo(memoNo: string) {
  const exact = await db.memo.findUnique({ where: { MemoNo: memoNo } });
  if (exact) return exact;
  return db.memo.findFirst({
    where: { MemoNo: { equals: memoNo, mode: "insensitive" } },
  });
}

export async function upsertMemoHeaderByNo(
  memoNo: string,
  memoPayload: MemoHeaderPayload,
  stockNoForCreate: string | null,
) {
  const existing = await findMemoByNo(memoNo);
  if (existing) {
    return db.memo.update({
      where: { MemoID: existing.MemoID },
      data: memoPayload,
    });
  }

  const createData = {
    MemoNo: memoNo,
    ...memoPayload,
    ...(stockNoForCreate ? { StockNo: stockNoForCreate } : {}),
  };

  try {
    return await db.memo.create({ data: createData });
  } catch (err) {
    if (!isMemoUniqueViolation(err)) throw err;

    const retry = await findMemoByNo(memoNo);
    if (retry) {
      return db.memo.update({
        where: { MemoID: retry.MemoID },
        data: memoPayload,
      });
    }

    if (stockNoForCreate) {
      try {
        return await db.memo.create({
          data: { MemoNo: memoNo, ...memoPayload },
        });
      } catch (err2) {
        if (!isMemoUniqueViolation(err2)) throw err2;
        const retry2 = await findMemoByNo(memoNo);
        if (retry2) {
          return db.memo.update({
            where: { MemoID: retry2.MemoID },
            data: memoPayload,
          });
        }
        throw err2;
      }
    }

    throw err;
  }
}

/** Upsert a memo keyed 1:1 to a stock line (Excel rows without MemoNo). */
export async function upsertMemoHeaderByStockNo(
  stockNo: string,
  memoNo: string,
  memoPayload: MemoHeaderPayload,
) {
  const existingByStock = await db.memo.findUnique({ where: { StockNo: stockNo } });
  if (existingByStock) {
    return db.memo.update({
      where: { MemoID: existingByStock.MemoID },
      data: { MemoNo: memoNo, ...memoPayload },
    });
  }

  const existingByNo = await findMemoByNo(memoNo);
  if (existingByNo) {
    const stockTaken = await db.memo.findUnique({ where: { StockNo: stockNo } });
    return db.memo.update({
      where: { MemoID: existingByNo.MemoID },
      data: {
        ...memoPayload,
        MemoNo: memoNo,
        ...(stockTaken || existingByNo.StockNo ? {} : { StockNo: stockNo }),
      },
    });
  }

  try {
    return await db.memo.create({
      data: { MemoNo: memoNo, StockNo: stockNo, ...memoPayload },
    });
  } catch (err) {
    if (!isMemoUniqueViolation(err)) throw err;

    const retryByStock = await db.memo.findUnique({ where: { StockNo: stockNo } });
    if (retryByStock) {
      return db.memo.update({
        where: { MemoID: retryByStock.MemoID },
        data: { MemoNo: memoNo, ...memoPayload },
      });
    }

    const retryByNo = await findMemoByNo(memoNo);
    if (retryByNo) {
      return db.memo.update({
        where: { MemoID: retryByNo.MemoID },
        data: memoPayload,
      });
    }

    throw err;
  }
}

export async function detachStaleActiveMemoLinks(
  stockNo: string,
  currentMemoNo: string,
): Promise<void> {
  const now = new Date();
  const activeLinks = await db.memo_stock.findMany({
    where: { StockNo: stockNo, Status: "active" },
    include: { Memo: { select: { MemoID: true, MemoNo: true } } },
  });

  for (const link of activeLinks) {
    if (link.Memo?.MemoNo === currentMemoNo) continue;

    await db.memo_stock.update({
      where: { MemoStockID: link.MemoStockID },
      data: {
        Status: "returned",
        StatusNote: `Moved to memo ${currentMemoNo} — detected via sync`,
        UpdatedAt: now,
      },
    });

    const memoId = link.MemoID;
    if (memoId) {
      const remainingActive = await db.memo_stock.count({
        where: { MemoID: memoId, Status: "active" },
      });
      if (remainingActive === 0) {
        await db.memo.update({
          where: { MemoID: memoId },
          data: { IsActive: false },
        });
      }
    }
  }

  const memosKeyedToStock = await db.memo.findMany({
    where: { StockNo: stockNo },
    select: { MemoID: true, MemoNo: true },
  });
  for (const memo of memosKeyedToStock) {
    if (memo.MemoNo !== currentMemoNo) {
      await db.memo.update({
        where: { MemoID: memo.MemoID },
        data: { StockNo: null },
      });
    }
  }
}

/** Create an active link only — never reactivate sold/returned/missing rows. */
export async function ensureActiveMemoStockLink(
  memoId: string,
  stockNo: string,
): Promise<void> {
  const activeOnTarget = await db.memo_stock.findFirst({
    where: { MemoID: memoId, StockNo: stockNo, Status: "active" },
  });
  if (activeOnTarget) return;

  await db.memo_stock.create({
    data: { MemoID: memoId, StockNo: stockNo },
  });
}

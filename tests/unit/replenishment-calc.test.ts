/**
 * Unit tests for replenishment calculation logic.
 * Tests the client-side logic from ReplenishmentV2Page and the API grouping logic.
 */
import { describe, it, expect } from "@jest/globals";

// ─── Helpers mirrored from ReplenishmentV2Page.tsx ────────────────────────────

function pickRandom<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pool.length));
}

function calcFactoryOrder(soldQty: number, inWarehouse: number, pullback: number): number {
  return Math.max(0, soldQty - inWarehouse - pullback);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("pickRandom", () => {
  it("returns the requested count", () => {
    const pool = ["A", "B", "C", "D", "E"];
    expect(pickRandom(pool, 3)).toHaveLength(3);
  });

  it("caps count at pool size — never returns more than available", () => {
    const pool = ["A", "B"];
    expect(pickRandom(pool, 10)).toHaveLength(2);
  });

  it("returns empty array for empty pool", () => {
    expect(pickRandom([], 5)).toHaveLength(0);
  });

  it("returns all items when count equals pool size", () => {
    const pool = ["A", "B", "C"];
    const result = pickRandom(pool, 3);
    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual(pool.sort());
  });

  it("returns count=0 correctly", () => {
    expect(pickRandom(["A", "B"], 0)).toHaveLength(0);
  });

  it("all returned items exist in the original pool", () => {
    const pool = ["X1", "X2", "X3", "X4", "X5"];
    const result = pickRandom(pool, 3);
    for (const item of result) {
      expect(pool).toContain(item);
    }
  });
});

describe("factory order calculation", () => {
  it("is soldQty - warehouse - pullback when positive", () => {
    expect(calcFactoryOrder(10, 3, 2)).toBe(5);
  });

  it("is 0 when warehouse covers all sold", () => {
    expect(calcFactoryOrder(5, 5, 0)).toBe(0);
  });

  it("is 0 when pullback covers remaining after warehouse", () => {
    expect(calcFactoryOrder(5, 3, 2)).toBe(0);
  });

  it("never goes negative", () => {
    expect(calcFactoryOrder(3, 5, 5)).toBe(0);
  });

  it("returns soldQty when no warehouse or pullback", () => {
    expect(calcFactoryOrder(7, 0, 0)).toBe(7);
  });
});

describe("pill count capping (warehouse pills = min(overrideQty, pool.length))", () => {
  function getPillCount(overrideQty: number, poolSize: number): number {
    return Math.min(overrideQty, poolSize);
  }

  it("uses overrideQty when less than pool", () => {
    expect(getPillCount(3, 10)).toBe(3);
  });

  it("caps at pool size when overrideQty exceeds pool", () => {
    expect(getPillCount(10, 4)).toBe(4);
  });

  it("returns 0 when pool is empty", () => {
    expect(getPillCount(5, 0)).toBe(0);
  });

  it("returns 0 when overrideQty is 0", () => {
    expect(getPillCount(0, 10)).toBe(0);
  });
});

describe("replenishment exclusion logic", () => {
  type Item = { invoiceNo: string; groupField: string; groupValue: string };

  function shouldInclude(
    item: Item,
    partialVisibility: boolean,
    replenishedCombos: Set<string>,
    excludedInvoiceNos: Set<string>,
  ): boolean {
    if (!partialVisibility) {
      return !excludedInvoiceNos.has(item.invoiceNo);
    }
    const key = JSON.stringify([item.invoiceNo, item.groupField, item.groupValue]);
    return !replenishedCombos.has(key);
  }

  it("partial=false excludes whole invoice when any item confirmed", () => {
    const item = { invoiceNo: "INV-1", groupField: "StyleNo", groupValue: "3333" };
    const excluded = new Set(["INV-1"]);
    expect(shouldInclude(item, false, new Set(), excluded)).toBe(false);
  });

  it("partial=false keeps item when invoice not confirmed", () => {
    const item = { invoiceNo: "INV-2", groupField: "StyleNo", groupValue: "3333" };
    const excluded = new Set(["INV-1"]);
    expect(shouldInclude(item, false, new Set(), excluded)).toBe(true);
  });

  it("partial=true excludes only the specific (invoice+field+value) combo", () => {
    const item = { invoiceNo: "INV-1", groupField: "StyleNo", groupValue: "3333" };
    const combo = new Set([JSON.stringify(["INV-1", "StyleNo", "3333"])]);
    expect(shouldInclude(item, true, combo, new Set())).toBe(false);
  });

  it("partial=true keeps items from same invoice but different group", () => {
    const item = { invoiceNo: "INV-1", groupField: "StyleNo", groupValue: "4444" };
    const combo = new Set([JSON.stringify(["INV-1", "StyleNo", "3333"])]);
    expect(shouldInclude(item, true, combo, new Set())).toBe(true);
  });
});

describe("pullback sort by rank", () => {
  type PullbackItem = { stockNo: string; overallRank: number | null; styleRank: number | null };

  function sortPullback(items: PullbackItem[]): PullbackItem[] {
    return [...items].sort((a, b) => {
      const aOverall = a.overallRank ?? Infinity;
      const bOverall = b.overallRank ?? Infinity;
      if (aOverall !== bOverall) return aOverall - bOverall;
      return (a.styleRank ?? Infinity) - (b.styleRank ?? Infinity);
    });
  }

  it("sorts by OverallRank ascending", () => {
    const items = [
      { stockNo: "C", overallRank: 3, styleRank: 1 },
      { stockNo: "A", overallRank: 1, styleRank: 1 },
      { stockNo: "B", overallRank: 2, styleRank: 1 },
    ];
    const sorted = sortPullback(items);
    expect(sorted.map((i) => i.stockNo)).toEqual(["A", "B", "C"]);
  });

  it("breaks OverallRank ties with StyleRank", () => {
    const items = [
      { stockNo: "B", overallRank: 1, styleRank: 2 },
      { stockNo: "A", overallRank: 1, styleRank: 1 },
    ];
    const sorted = sortPullback(items);
    expect(sorted[0].stockNo).toBe("A");
  });

  it("pushes null-rank items to the end", () => {
    const items = [
      { stockNo: "B", overallRank: null, styleRank: null },
      { stockNo: "A", overallRank: 1, styleRank: 1 },
    ];
    const sorted = sortPullback(items);
    expect(sorted[0].stockNo).toBe("A");
    expect(sorted[1].stockNo).toBe("B");
  });
});

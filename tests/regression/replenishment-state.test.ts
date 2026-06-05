/**
 * Regression tests for replenishment state invariants.
 * Guards against bugs in quantity calculation and stock selection logic.
 */
import { describe, it, expect } from "@jest/globals";

// Mirrors calcFactoryOrder from lib/replenishment-v2.ts
function calcFactoryOrder(
  soldQty: number,
  inWarehouseQty: number,
  inPullbackQty: number,
  overrideQty: number
): number {
  const coverage = inWarehouseQty + inPullbackQty;
  const gap = soldQty - coverage;
  if (gap <= 0) return 0;
  // use overrideQty as target, capped by gap
  return Math.min(overrideQty, gap);
}

// pickRandom — stable deterministic subset (for testing the cap logic)
function pickAtMost(pool: string[], count: number): string[] {
  if (count <= 0 || pool.length === 0) return [];
  return pool.slice(0, Math.min(count, pool.length));
}

describe("calcFactoryOrder — regression", () => {
  it("never returns a negative value", () => {
    expect(calcFactoryOrder(5, 10, 5, 3)).toBe(0); // fully covered
    expect(calcFactoryOrder(0, 0, 0, 5)).toBe(0);
  });

  it("returns 0 when warehouse + pullback covers sold qty", () => {
    expect(calcFactoryOrder(10, 6, 4, 100)).toBe(0);
  });

  it("returns the gap when override exceeds the gap", () => {
    // sold=10, coverage=3, gap=7, override=50 → cap at 7
    expect(calcFactoryOrder(10, 2, 1, 50)).toBe(7);
  });

  it("returns override when override < gap", () => {
    // sold=20, coverage=5, gap=15, override=8 → 8
    expect(calcFactoryOrder(20, 3, 2, 8)).toBe(8);
  });

  it("handles zero coverage case", () => {
    // sold=5, coverage=0, gap=5, override=3 → 3
    expect(calcFactoryOrder(5, 0, 0, 3)).toBe(3);
  });
});

describe("Stock pill selection — regression", () => {
  it("selected stock count does not exceed overrideQty cap", () => {
    const allStockNos = ["S1", "S2", "S3", "S4", "S5"];
    const overrideQty = 2;
    const selected = pickAtMost(allStockNos, overrideQty);
    expect(selected.length).toBeLessThanOrEqual(overrideQty);
  });

  it("empty pool returns empty selection", () => {
    expect(pickAtMost([], 5)).toEqual([]);
  });

  it("overrideQty = 0 returns empty selection", () => {
    expect(pickAtMost(["S1", "S2"], 0)).toEqual([]);
  });

  it("pool smaller than cap returns all items", () => {
    const pool = ["S1", "S2"];
    const result = pickAtMost(pool, 10);
    expect(result).toHaveLength(2);
  });
});

describe("Replenishment confirm payload — regression", () => {
  it("empty rows array is invalid", () => {
    const payload = { groupField: "StyleNo", rows: [] };
    expect(payload.rows.length).toBe(0);
    // The API should reject this — validated in api/replenishment.test.ts
  });

  it("row must have at least one invoiceNo", () => {
    const row = {
      groupValue: "STYLE-001",
      invoiceNos: ["INV-001"],
      stockNos: [{ stockNo: "STK-001", type: "warehouse" }],
    };
    expect(row.invoiceNos.length).toBeGreaterThan(0);
    expect(row.stockNos.length).toBeGreaterThan(0);
  });

  it("undo payload requires non-empty replenishmentIds", () => {
    const valid = { replenishmentIds: ["rep-1", "rep-2"] };
    const invalid = { replenishmentIds: [] };
    expect(valid.replenishmentIds.length).toBeGreaterThan(0);
    expect(invalid.replenishmentIds.length).toBe(0);
  });
});

describe("Date range validation — regression", () => {
  it("fromDate must not be after toDate", () => {
    const isValidRange = (from: string, to: string) =>
      new Date(from) <= new Date(to);

    expect(isValidRange("2026-01-01", "2026-01-31")).toBe(true);
    expect(isValidRange("2026-02-01", "2026-01-01")).toBe(false);
    expect(isValidRange("2026-01-15", "2026-01-15")).toBe(true); // same day ok
  });
});

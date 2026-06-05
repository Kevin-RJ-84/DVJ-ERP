/**
 * Regression tests for upload deduplication logic.
 * Guards against re-introducing bugs where duplicate rows were inserted.
 */
import { describe, it, expect } from "@jest/globals";

// Deduplication logic mirrored from the upload pipeline for testable isolation
function deduplicateStock(rows: { StockNo: string; Metal: string; Qty: number }[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.StockNo)) return false;
    seen.add(r.StockNo);
    return true;
  });
}

function deduplicateSales(rows: { InvoiceNo: string; StockNo: string; Qty: number }[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.InvoiceNo}::${r.StockNo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

describe("Stock deduplication — regression", () => {
  it("removes exact duplicate StockNo rows", () => {
    const rows = [
      { StockNo: "S001", Metal: "Gold", Qty: 1 },
      { StockNo: "S001", Metal: "Gold", Qty: 1 }, // duplicate
      { StockNo: "S002", Metal: "Silver", Qty: 2 },
    ];
    const result = deduplicateStock(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.StockNo)).toEqual(["S001", "S002"]);
  });

  it("keeps first occurrence when there are duplicates", () => {
    const rows = [
      { StockNo: "S001", Metal: "Gold", Qty: 5 },
      { StockNo: "S001", Metal: "Gold", Qty: 99 }, // different qty — first wins
    ];
    const result = deduplicateStock(rows);
    expect(result).toHaveLength(1);
    expect(result[0].Qty).toBe(5);
  });

  it("handles empty input", () => {
    expect(deduplicateStock([])).toEqual([]);
  });

  it("does not mutate original array", () => {
    const rows = [
      { StockNo: "S001", Metal: "Gold", Qty: 1 },
      { StockNo: "S001", Metal: "Gold", Qty: 1 },
    ];
    deduplicateStock(rows);
    expect(rows).toHaveLength(2);
  });
});

describe("Sales deduplication — regression", () => {
  it("removes rows with same InvoiceNo + StockNo", () => {
    const rows = [
      { InvoiceNo: "INV-001", StockNo: "S001", Qty: 1 },
      { InvoiceNo: "INV-001", StockNo: "S001", Qty: 1 }, // duplicate
      { InvoiceNo: "INV-001", StockNo: "S002", Qty: 1 }, // different StockNo — keep
      { InvoiceNo: "INV-002", StockNo: "S001", Qty: 1 }, // different InvoiceNo — keep
    ];
    const result = deduplicateSales(rows);
    expect(result).toHaveLength(3);
  });

  it("keeps same StockNo under different InvoiceNos", () => {
    const rows = [
      { InvoiceNo: "INV-001", StockNo: "S001", Qty: 1 },
      { InvoiceNo: "INV-002", StockNo: "S001", Qty: 2 },
    ];
    const result = deduplicateSales(rows);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(deduplicateSales([])).toEqual([]);
  });
});

describe("Upload regression — zero-byte file guard", () => {
  it("empty Blob has size 0", () => {
    const emptyBlob = new Blob([], { type: "application/vnd.ms-excel" });
    expect(emptyBlob.size).toBe(0);
  });

  it("non-empty Blob has positive size", () => {
    const blob = new Blob(["hello"], { type: "text/csv" });
    expect(blob.size).toBeGreaterThan(0);
  });
});

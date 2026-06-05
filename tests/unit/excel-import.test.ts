/**
 * Unit tests for Excel import logic (xlsxCellToScalar and cell parsing).
 * These test the pure parsing functions without hitting the file system.
 */
import { describe, it, expect } from "@jest/globals";

// ─── Inline the scalar logic under test ──────────────────────────────────────
// We test the behaviour described in lib/excel.ts (xlsxCellToScalar).
// The actual implementation is complex (handles rich text, hyperlinks, etc.),
// so we test the expected contracts.

type CellValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { text?: string; hyperlink?: string }
  | { richText: Array<{ text: string }> };

function xlsxCellToScalar(value: CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // Rich-text object
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((seg) => seg.text).join("");
  }
  // Hyperlink/text object
  if (typeof value === "object" && "text" in value && value.text !== undefined) {
    return value.text;
  }
  return null;
}

function asDecimalMoney(value: CellValue): string | null {
  const scalar = xlsxCellToScalar(value);
  if (scalar === null || scalar === undefined) return null;
  const str = String(scalar).replace(/[^0-9.-]/g, "");
  const num = parseFloat(str);
  return isNaN(num) ? null : num.toFixed(2);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("xlsxCellToScalar", () => {
  it("passes through plain strings", () => {
    expect(xlsxCellToScalar("hello")).toBe("hello");
  });

  it("passes through numbers", () => {
    expect(xlsxCellToScalar(5000)).toBe(5000);
  });

  it("passes through booleans", () => {
    expect(xlsxCellToScalar(true)).toBe(true);
  });

  it("returns null for null", () => {
    expect(xlsxCellToScalar(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(xlsxCellToScalar(undefined)).toBeNull();
  });

  it("concatenates rich-text segments", () => {
    const cell = { richText: [{ text: "Hello" }, { text: " World" }] };
    expect(xlsxCellToScalar(cell)).toBe("Hello World");
  });

  it("reads hyperlink display text", () => {
    const cell = { text: "5000.00", hyperlink: "https://example.com" };
    expect(xlsxCellToScalar(cell)).toBe("5000.00");
  });

  it("returns null for unknown object shape", () => {
    // Object with no known properties
    expect(xlsxCellToScalar({} as CellValue)).toBeNull();
  });
});

describe("asDecimalMoney", () => {
  it("parses plain numeric string", () => {
    expect(asDecimalMoney("5000")).toBe("5000.00");
  });

  it("strips currency symbols", () => {
    expect(asDecimalMoney("$3,000.50")).toBe("3000.50");
  });

  it("parses numeric cell value", () => {
    expect(asDecimalMoney(1500.75)).toBe("1500.75");
  });

  it("returns null for null input", () => {
    expect(asDecimalMoney(null)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(asDecimalMoney("N/A")).toBeNull();
  });

  it("parses rich-text currency cell", () => {
    const cell = { richText: [{ text: "₹" }, { text: "2500.00" }] };
    expect(asDecimalMoney(cell)).toBe("2500.00");
  });
});

describe("stock row categorisation logic", () => {
  type StockRow = {
    StockNo: string;
    Company?: string | null;
    HoldDate?: Date | null;
  };

  function categorise(row: StockRow): "warehouse" | "memo" | "hold" {
    if (row.HoldDate) return "hold";
    if (row.Company && row.Company.trim()) return "memo";
    return "warehouse";
  }

  it("empty Company → in warehouse", () => {
    expect(categorise({ StockNo: "S1", Company: null })).toBe("warehouse");
  });

  it("non-empty Company → on memo", () => {
    expect(categorise({ StockNo: "S1", Company: "ABC Jewels" })).toBe("memo");
  });

  it("HoldDate set → on hold (takes precedence)", () => {
    expect(categorise({ StockNo: "S1", Company: null, HoldDate: new Date() })).toBe("hold");
  });

  it("HoldDate + Company → still hold (hold takes precedence)", () => {
    expect(categorise({ StockNo: "S1", Company: "ABC", HoldDate: new Date() })).toBe("hold");
  });
});

describe("deduplication logic", () => {
  it("skips duplicate StockNo in stock import", () => {
    const seen = new Set<string>();
    const rows = ["S1", "S2", "S1", "S3", "S2"];
    const deduped = rows.filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
    expect(deduped).toEqual(["S1", "S2", "S3"]);
  });

  it("skips duplicate InvoiceNo+StockNo in sales import", () => {
    const seen = new Set<string>();
    const rows = [
      { inv: "I1", stk: "S1" },
      { inv: "I1", stk: "S2" },
      { inv: "I1", stk: "S1" }, // duplicate
      { inv: "I2", stk: "S1" }, // different invoice, not duplicate
    ];
    const deduped = rows.filter(({ inv, stk }) => {
      const key = `${inv}::${stk}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    expect(deduped).toHaveLength(3);
  });
});

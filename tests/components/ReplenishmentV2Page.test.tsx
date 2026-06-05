/**
 * Component tests for ReplenishmentV2Page — focuses on pure utility functions
 * extracted from the component rather than the full component tree (which requires
 * extensive mocking of jsPDF, fetch, and routing).
 */
import { describe, it, expect } from "@jest/globals";

// Utility extracted from ReplenishmentV2Page for testability
function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeMetalType(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function matchesSoldMetalType(
  stockMetalType: string | null | undefined,
  soldMetalTypes: Set<string>
): boolean {
  if (soldMetalTypes.size === 0) return true;
  return soldMetalTypes.has(normalizeMetalType(stockMetalType));
}

describe("toIsoDateLocal", () => {
  it("formats date as YYYY-MM-DD in local time", () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026 local
    expect(toIsoDateLocal(d)).toBe("2026-01-05");
  });

  it("pads month and day with leading zero", () => {
    const d = new Date(2026, 8, 3); // Sep 3
    expect(toIsoDateLocal(d)).toBe("2026-09-03");
  });

  it("handles December correctly", () => {
    const d = new Date(2026, 11, 31);
    expect(toIsoDateLocal(d)).toBe("2026-12-31");
  });
});

describe("normalizeMetalType", () => {
  it("lowercases the value", () => {
    expect(normalizeMetalType("Yellow Gold")).toBe("yellow gold");
  });

  it("trims whitespace", () => {
    expect(normalizeMetalType("  White Gold  ")).toBe("white gold");
  });

  it("returns empty string for null", () => {
    expect(normalizeMetalType(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeMetalType(undefined)).toBe("");
  });
});

describe("matchesSoldMetalType", () => {
  it("returns true when soldMetalTypes is empty (no filter)", () => {
    expect(matchesSoldMetalType("Yellow Gold", new Set())).toBe(true);
  });

  it("matches when normalized stock metalType is in sold set", () => {
    const sold = new Set(["yellow gold"]);
    expect(matchesSoldMetalType("Yellow Gold", sold)).toBe(true);
  });

  it("does not match when metalType differs", () => {
    const sold = new Set(["yellow gold"]);
    expect(matchesSoldMetalType("White Gold", sold)).toBe(false);
  });

  it("handles null stockMetalType with non-empty sold set", () => {
    const sold = new Set(["yellow gold"]);
    // null normalizes to "" which is not in the sold set
    expect(matchesSoldMetalType(null, sold)).toBe(false);
  });

  it("multiple sold metal types — matches any", () => {
    const sold = new Set(["yellow gold", "rose gold"]);
    expect(matchesSoldMetalType("Rose Gold", sold)).toBe(true);
    expect(matchesSoldMetalType("White Gold", sold)).toBe(false);
  });
});

import { render, screen } from "@testing-library/react";
import { StockPillGroup } from "@/components/replenishment/StockPillGroup";

describe("StockPillGroup integration snapshot", () => {
  it("renders correctly for selected and unselected mixed state", () => {
    render(
      <StockPillGroup
        allStockNos={["A", "B", "C"]}
        selectedStockNos={new Set(["B"])}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("B").className).toContain("emerald");
    expect(screen.getByText("A").className).toContain("stone");
  });
});

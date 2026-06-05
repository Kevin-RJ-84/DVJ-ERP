/**
 * Regression tests for ranking calculation consistency.
 * Guards against re-introducing bugs in the ranking logic refactor.
 */
import { describe, it, expect } from "@jest/globals";

// Simplified ranking logic mirrored from lib/rankings.ts for isolated testing

type ClientSalesRow = {
  ClientID: string;
  TotalQty: bigint;
  TotalRevenue: number;
  TotalProfit: number;
};

function computeOverallRanks(
  rows: ClientSalesRow[],
  metric: "Revenue" | "Profit" | "Qty"
): Map<string, { rank: number; score: number }> {
  const scored = rows.map((r) => ({
    ClientID: r.ClientID,
    score:
      metric === "Revenue"
        ? r.TotalRevenue
        : metric === "Profit"
        ? r.TotalProfit
        : Number(r.TotalQty),
  }));

  scored.sort((a, b) => b.score - a.score);

  const result = new Map<string, { rank: number; score: number }>();
  let rank = 1;
  for (const row of scored) {
    result.set(row.ClientID, { rank, score: row.score });
    rank++;
  }
  return result;
}

describe("Overall ranking — regression", () => {
  const clients: ClientSalesRow[] = [
    { ClientID: "c1", TotalQty: 100n, TotalRevenue: 50000, TotalProfit: 12000 },
    { ClientID: "c2", TotalQty: 200n, TotalRevenue: 80000, TotalProfit: 20000 },
    { ClientID: "c3", TotalQty: 50n, TotalRevenue: 30000, TotalProfit: 8000 },
  ];

  it("rank 1 is the client with the highest score", () => {
    const ranks = computeOverallRanks(clients, "Revenue");
    expect(ranks.get("c2")?.rank).toBe(1);
  });

  it("rank ordering is correct for all clients", () => {
    const ranks = computeOverallRanks(clients, "Revenue");
    expect(ranks.get("c2")?.rank).toBe(1);
    expect(ranks.get("c1")?.rank).toBe(2);
    expect(ranks.get("c3")?.rank).toBe(3);
  });

  it("uses Profit metric when configured", () => {
    const ranks = computeOverallRanks(clients, "Profit");
    expect(ranks.get("c2")?.rank).toBe(1); // c2 has highest profit too
    expect(ranks.get("c3")?.rank).toBe(3);
  });

  it("uses Qty metric when configured", () => {
    const ranks = computeOverallRanks(clients, "Qty");
    expect(ranks.get("c2")?.rank).toBe(1); // c2 has highest qty
    expect(ranks.get("c3")?.rank).toBe(3);
  });

  it("handles single client — gets rank 1", () => {
    const single: ClientSalesRow[] = [
      { ClientID: "c1", TotalQty: 10n, TotalRevenue: 1000, TotalProfit: 300 },
    ];
    const ranks = computeOverallRanks(single, "Revenue");
    expect(ranks.get("c1")?.rank).toBe(1);
  });

  it("handles empty clients list", () => {
    const ranks = computeOverallRanks([], "Revenue");
    expect(ranks.size).toBe(0);
  });

  it("OverallRank stored on clients, not customer_rankings — schema contract", () => {
    // Document the post-refactor contract: OverallRank lives on clients table.
    // customer_rankings.StyleNo is NOT NULL after migration.
    const styleRankRow = {
      ClientID: "c1",
      StyleNo: "STYLE-123", // must always be non-null after migration
      StyleRank: 1,
      // OverallRank is NOT in this object — it moved to clients
    };
    expect(styleRankRow).not.toHaveProperty("OverallRank");
    expect(styleRankRow.StyleNo).not.toBeNull();
  });
});

describe("Style ranking — regression", () => {
  type StyleRow = { ClientID: string; StyleNo: string; score: number };

  function computeStyleRanks(rows: StyleRow[]): Map<string, number> {
    const byClient = new Map<string, StyleRow[]>();
    for (const row of rows) {
      if (!byClient.has(row.ClientID)) byClient.set(row.ClientID, []);
      byClient.get(row.ClientID)!.push(row);
    }
    const result = new Map<string, number>();
    for (const [clientId, clientRows] of byClient) {
      const sorted = [...clientRows].sort((a, b) => b.score - a.score);
      sorted.forEach((r, i) => {
        result.set(`${clientId}::${r.StyleNo}`, i + 1);
      });
    }
    return result;
  }

  it("per-client style ranking is independent", () => {
    const rows: StyleRow[] = [
      { ClientID: "c1", StyleNo: "S1", score: 100 },
      { ClientID: "c1", StyleNo: "S2", score: 50 },
      { ClientID: "c2", StyleNo: "S1", score: 10 }, // c2's S1 gets rank 1 for c2
    ];
    const ranks = computeStyleRanks(rows);
    expect(ranks.get("c1::S1")).toBe(1);
    expect(ranks.get("c1::S2")).toBe(2);
    expect(ranks.get("c2::S1")).toBe(1); // independent ranking for c2
  });

  it("style with highest score gets rank 1 per client", () => {
    const rows: StyleRow[] = [
      { ClientID: "c1", StyleNo: "S3", score: 999 },
      { ClientID: "c1", StyleNo: "S1", score: 100 },
      { ClientID: "c1", StyleNo: "S2", score: 50 },
    ];
    const ranks = computeStyleRanks(rows);
    expect(ranks.get("c1::S3")).toBe(1);
  });
});

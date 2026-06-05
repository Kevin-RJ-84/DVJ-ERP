import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@/lib/db", () => ({
  db: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    system_config: { upsert: jest.fn() },
  },
}));

jest.mock("@/lib/config", () => ({
  getConfig: jest.fn(),
  getConfigDecimal: jest.fn(),
}));

import { db } from "@/lib/db";
import { getConfig, getConfigDecimal } from "@/lib/config";
import { recalculateRankings } from "@/lib/rankings";

const mockQueryRaw = db.$queryRaw as jest.Mock;
const mockExecuteRaw = db.$executeRaw as jest.Mock;
const mockSystemConfigUpsert = db.system_config.upsert as jest.Mock;
const mockGetConfig = getConfig as jest.Mock;
const mockGetConfigDecimal = getConfigDecimal as jest.Mock;

function setupDefaultConfig(overrides: Partial<{
  metric: string;
  valueWeight: number;
  volumeWeight: number;
  period: string;
}> = {}) {
  mockGetConfig.mockImplementation(async (key: string) => {
    const vals: Record<string, string> = {
      ranking_value_metric: overrides.metric ?? "SaleValue",
      ranking_period: overrides.period ?? "all_time",
    };
    if (!(key in vals)) throw new Error(`Config key '${key}' not found`);
    return vals[key];
  });
  mockGetConfigDecimal.mockImplementation(async (key: string) => {
    const vals: Record<string, number> = {
      ranking_value_weight: overrides.valueWeight ?? 0.6,
      ranking_volume_weight: overrides.volumeWeight ?? 0.4,
    };
    if (!(key in vals)) throw new Error(`Config key '${key}' not found`);
    return vals[key];
  });
}

function makeOverallRow(clientId: string, score: string, rank: bigint) {
  return {
    ClientID: clientId,
    TotalPiecesSold: BigInt(10),
    TotalValueSold: "5000.00",
    TotalProfit: "2000.00",
    CombinedScore: score,
    OverallRank: rank,
  };
}

function makeStyleRow(clientId: string, styleNo: string, rank: bigint) {
  return {
    ClientID: clientId,
    StyleNo: styleNo,
    TotalPiecesSold: BigInt(5),
    TotalValueSold: "2500.00",
    TotalProfit: "1000.00",
    CombinedScore: "3400.00",
    StyleRank: rank,
  };
}

describe("lib/rankings — recalculateRankings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultConfig();
    mockExecuteRaw.mockResolvedValue(1);
    mockSystemConfigUpsert.mockResolvedValue({});
  });

  it("reads all four config keys", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    expect(mockGetConfig).toHaveBeenCalledWith("ranking_value_metric");
    expect(mockGetConfig).toHaveBeenCalledWith("ranking_period");
    expect(mockGetConfigDecimal).toHaveBeenCalledWith("ranking_value_weight");
    expect(mockGetConfigDecimal).toHaveBeenCalledWith("ranking_volume_weight");
  });

  // Helper: check if a Prisma Sql object's strings contain a substring.
  function sqlStringsContain(sql: unknown, substring: string): boolean {
    if (!sql || typeof sql !== "object") return false;
    const s = sql as { strings?: unknown[] };
    return Array.isArray(s.strings) && s.strings.some(
      (str: unknown) => typeof str === "string" && str.includes(substring)
    );
  }

  it("deletes NULL-StyleNo rows from customer_rankings before writing", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    // Prisma.sql returns {strings, values} — check the strings array for DELETE
    expect(mockExecuteRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        strings: expect.arrayContaining([expect.stringContaining("DELETE")]),
      })
    );
  });

  it("updates clients table with OverallRank for each client with sales", async () => {
    const overallRows = [
      makeOverallRow("client-1", "3400.00", BigInt(1)),
      makeOverallRow("client-2", "2800.00", BigInt(2)),
    ];
    // First queryRaw = overall, second = style
    mockQueryRaw
      .mockResolvedValueOnce(overallRows)
      .mockResolvedValueOnce([]);

    await recalculateRankings();

    // Should have called executeRaw: 1 DELETE + 2 UPDATE clients = 3 times minimum
    const updateCalls = mockExecuteRaw.mock.calls.filter((args: unknown[]) =>
      sqlStringsContain(args[0], "UPDATE clients")
    );
    expect(updateCalls.length).toBe(2);
  });

  it("upserts style rows into customer_rankings", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([makeOverallRow("client-1", "3400.00", BigInt(1))])
      .mockResolvedValueOnce([makeStyleRow("client-1", "3333", BigInt(1))]);

    await recalculateRankings();

    const insertCalls = mockExecuteRaw.mock.calls.filter((args: unknown[]) =>
      sqlStringsContain(args[0], "INSERT INTO customer_rankings")
    );
    expect(insertCalls.length).toBe(1);
  });

  it("clients with no sales do not get an UPDATE clients call", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    const updateCalls = mockExecuteRaw.mock.calls.filter((args: unknown[]) =>
      sqlStringsContain(args[0], "UPDATE clients")
    );
    expect(updateCalls.length).toBe(0);
  });

  it("records ranking_last_calculated timestamp after successful run", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    expect(mockSystemConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ConfigKey: "ranking_last_calculated" },
      })
    );
  });

  it("is idempotent — running twice produces same number of DB calls per run", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    const firstRunCalls = mockExecuteRaw.mock.calls.length;

    jest.clearAllMocks();
    mockExecuteRaw.mockResolvedValue(1);
    mockSystemConfigUpsert.mockResolvedValue({});
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    const secondRunCalls = mockExecuteRaw.mock.calls.length;

    expect(firstRunCalls).toBe(secondRunCalls);
  });

  it("switches value column when metric is Profit", async () => {
    setupDefaultConfig({ metric: "Profit" });
    mockQueryRaw.mockResolvedValue([]);
    await recalculateRankings();
    // Both SQL calls should reference TotalProfit, not TotalValueSold, for the scored CTE.
    // Prisma.sql returns {strings, values} — flatten strings from all query calls.
    const queryCalls = mockQueryRaw.mock.calls;
    const combinedSqlText = queryCalls
      .flatMap((args: unknown[]) => {
        const sql = args[0] as { strings?: string[] };
        return sql.strings ?? [];
      })
      .join(" ");
    expect(combinedSqlText).toContain('"TotalProfit"');
  });
});

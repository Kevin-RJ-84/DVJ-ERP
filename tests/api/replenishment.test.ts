/**
 * API integration tests for replenishment routes.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@/lib/db", () => ({
  db: {
    clients: { findUnique: jest.fn() },
    sales: { findMany: jest.fn() },
    replenishments: {
      findMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    stock: { findMany: jest.fn() },
    memo_stock: { findMany: jest.fn() },
    customer_rankings: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/auth-server", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/rbac", () => ({
  requirePermission: jest.fn().mockResolvedValue(undefined),
  ForbiddenError: class ForbiddenError extends Error {
    constructor(perm: string) { super(perm); }
  },
}));

jest.mock("@/lib/config", () => ({
  getConfigBool: jest.fn().mockResolvedValue(true),
}));

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { TEST_IDS, makeClient, makeSale } from "../fixtures/seed-test-db";

// Typed mock aliases
const mockTransaction = db.$transaction as jest.Mock;
const mockReplenishmentsCount = db.replenishments.count as jest.Mock;
import { GET as replenishmentV2Get } from "@/app/api/replenishment/v2/route";
import { POST as confirmPost } from "@/app/api/replenishment/confirm/route";
import { POST as undoPost } from "@/app/api/replenishment/undo/route";
import { GET as historyGet } from "@/app/api/replenishment/history/route";
import { NextRequest } from "next/server";

const mockRequireAuth = requireAuth as jest.Mock;
const mockClientsFind = db.clients.findUnique as jest.Mock;
const mockSalesFind = db.sales.findMany as jest.Mock;
const mockReplenishmentsFind = db.replenishments.findMany as jest.Mock;
const mockCreateMany = db.replenishments.createManyAndReturn as jest.Mock;
const mockUpdateMany = db.replenishments.updateMany as jest.Mock;
const mockStockFind = db.stock.findMany as jest.Mock;
const mockMemoStockFind = db.memo_stock.findMany as jest.Mock;
const mockRankingsFind = db.customer_rankings.findMany as jest.Mock;

function setupAuth(userId = TEST_IDS.memberUserId) {
  mockRequireAuth.mockResolvedValue({ userId, role: "member", email: "test@example.com" });
}

function makeV2Request(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/replenishment/v2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

describe("GET /api/replenishment/v2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockClientsFind.mockResolvedValue(makeClient({ ClientID: TEST_IDS.client1Id }));
    mockSalesFind.mockResolvedValue([]);
    mockReplenishmentsFind.mockResolvedValue([]);
    mockStockFind.mockResolvedValue([]);
    mockMemoStockFind.mockResolvedValue([]);
    mockRankingsFind.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue(null);
    const req = makeV2Request({
      clientId: TEST_IDS.client1Id,
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      groupBy: "StyleNo",
    });
    const res = await replenishmentV2Get(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID clientId", async () => {
    const req = makeV2Request({
      clientId: "not-a-uuid",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      groupBy: "StyleNo",
    });
    const res = await replenishmentV2Get(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when client not found", async () => {
    mockClientsFind.mockResolvedValue(null);
    const req = makeV2Request({
      clientId: TEST_IDS.client1Id,
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      groupBy: "StyleNo",
    });
    const res = await replenishmentV2Get(req);
    expect(res.status).toBe(404);
  });

  it("returns rows array for valid request with no sales", async () => {
    const req = makeV2Request({
      clientId: TEST_IDS.client1Id,
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      groupBy: "StyleNo",
    });
    const res = await replenishmentV2Get(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 400 for invalid date range (from > to)", async () => {
    const req = makeV2Request({
      clientId: TEST_IDS.client1Id,
      fromDate: "2026-02-01",
      toDate: "2026-01-01",
      groupBy: "StyleNo",
    });
    const res = await replenishmentV2Get(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/replenishment/confirm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockCreateMany.mockResolvedValue([{ ReplenishmentID: "rep-id-1" }]);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/replenishment/confirm", {
      method: "POST",
      body: JSON.stringify({ groupField: "StyleNo", rows: [] }),
    });
    const res = await confirmPost(req);
    expect(res.status).toBe(401);
  });

  it("saves replenishment records and returns IDs", async () => {
    const req = new NextRequest("http://localhost:3000/api/replenishment/confirm", {
      method: "POST",
      body: JSON.stringify({
        groupField: "StyleNo",
        rows: [
          {
            groupValue: "3333",
            invoiceNos: ["INV-001"],
            stockNos: [{ stockNo: "STK-001", type: "warehouse" }],
          },
        ],
      }),
    });
    const res = await confirmPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.replenishmentIds)).toBe(true);
  });

  it("returns 400 for empty body", async () => {
    const req = new NextRequest("http://localhost:3000/api/replenishment/confirm", {
      method: "POST",
      body: "{}",
    });
    const res = await confirmPost(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/replenishment/undo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("sets IsUndone = true and returns updatedCount", async () => {
    const req = new NextRequest("http://localhost:3000/api/replenishment/undo", {
      method: "POST",
      body: JSON.stringify({ replenishmentIds: [TEST_IDS.replenishment1Id] }),
    });
    const res = await undoPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.updatedCount).toBe("number");
  });

  it("returns 400 for empty replenishmentIds array", async () => {
    const req = new NextRequest("http://localhost:3000/api/replenishment/undo", {
      method: "POST",
      body: JSON.stringify({ replenishmentIds: [] }),
    });
    const res = await undoPost(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/replenishment/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockReplenishmentsFind.mockResolvedValue([]);
    mockReplenishmentsCount.mockResolvedValue(0);
    mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops)
    );
  });

  it("returns paginated history structure", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/replenishment/history?page=1&limit=20"
    );
    const res = await historyGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("items");
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/replenishment/history");
    const res = await historyGet(req);
    expect(res.status).toBe(401);
  });
});

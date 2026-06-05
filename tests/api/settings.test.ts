/**
 * API integration tests for /api/settings.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@/lib/db", () => ({
  db: {
    system_config: {
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    users: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/auth-server", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/rbac", () => ({
  requirePermission: jest.fn().mockResolvedValue(undefined),
  ForbiddenError: class ForbiddenError extends Error {
    response = { status: 403 };
    constructor(perm: string) { super(perm); }
  },
}));

jest.mock("@/lib/config", () => ({
  invalidateConfigCache: jest.fn(),
}));

jest.mock("@/lib/rankings", () => ({
  recalculateRankings: jest.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { GET, PATCH } from "@/app/api/settings/route";
import { NextRequest } from "next/server";
import { TEST_IDS, DEFAULT_SYSTEM_CONFIG } from "../fixtures/seed-test-db";

const mockRequireAuth = requireAuth as jest.Mock;
const mockFindMany = db.system_config.findMany as jest.Mock;
const mockUpdate = db.system_config.update as jest.Mock;
const mockFindUnique = db.system_config.findUnique as jest.Mock;

function setupAuth(userId = TEST_IDS.adminUserId) {
  mockRequireAuth.mockResolvedValue({ userId, role: "admin", email: "admin@example.com" });
}

describe("GET /api/settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockFindMany.mockResolvedValue(DEFAULT_SYSTEM_CONFIG);
  });

  it("returns all config rows grouped by module", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data).toBe("object");
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/settings");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockFindUnique.mockResolvedValue({
      ConfigKey: "default_group_by",
      ConfigValue: "StyleNo",
      ConfigType: "enum",
    });
    mockUpdate.mockResolvedValue({
      ConfigKey: "default_group_by",
      ConfigValue: "Metal",
    });
  });

  it("updates a config value", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ key: "default_group_by", value: "Metal" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 for missing key", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ value: "Metal" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ key: "default_group_by", value: "Metal" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("invalidates config cache after update", async () => {
    const { invalidateConfigCache } = await import("@/lib/config");
    const req = new NextRequest("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ key: "default_group_by", value: "Metal" }),
    });
    await PATCH(req);
    expect(invalidateConfigCache).toHaveBeenCalled();
  });
});

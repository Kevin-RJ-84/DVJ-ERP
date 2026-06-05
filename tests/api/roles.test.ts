/**
 * API integration tests for /api/roles.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@/lib/db", () => ({
  db: {
    roles: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    permissions: { findMany: jest.fn() },
    role_permissions: { deleteMany: jest.fn(), createMany: jest.fn() },
    users: { findUnique: jest.fn(), count: jest.fn() },
  },
}));

jest.mock("@/lib/auth-server", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/rbac", () => ({
  requirePermission: jest.fn().mockResolvedValue(undefined),
  invalidateUserPermissionCache: jest.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    response = { status: 403 };
    constructor(perm: string) { super(perm); }
  },
}));

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { GET, POST, PATCH, DELETE } from "@/app/api/roles/route";
import { NextRequest } from "next/server";
import { TEST_IDS } from "../fixtures/seed-test-db";

const mockRequireAuth = requireAuth as jest.Mock;
const mockRolesFindMany = db.roles.findMany as jest.Mock;
const mockRolesCreate = db.roles.create as jest.Mock;
const mockRolesFindUnique = db.roles.findUnique as jest.Mock;
const mockRolesDelete = db.roles.delete as jest.Mock;

function setupAuth(userId = TEST_IDS.adminUserId) {
  mockRequireAuth.mockResolvedValue({ userId, role: "admin", email: "admin@example.com" });
}

const sampleRole = {
  RoleID: "role-id-1",
  RoleName: "test_role",
  Description: "A test role",
  IsSystem: false,
  CreatedAt: new Date(),
  Users: [],
  Permissions: [],
  _count: { Users: 0 },
};

describe("GET /api/roles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockRolesFindMany.mockResolvedValue([sampleRole]);
  });

  it("returns roles list", async () => {
    const req = new NextRequest("http://localhost:3000/api/roles");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json() as { roles: unknown[] };
    expect(Array.isArray(data.roles)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/roles");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/roles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
    mockRolesCreate.mockResolvedValue({ ...sampleRole, RoleName: "new_role" });
  });

  it("creates a new role", async () => {
    const req = new NextRequest("http://localhost:3000/api/roles", {
      method: "POST",
      body: JSON.stringify({ roleName: "new_role", description: "A new role" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 400 when roleName is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/roles", {
      method: "POST",
      body: JSON.stringify({ description: "No name" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/roles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuth();
  });

  it("refuses to delete a system role", async () => {
    mockRolesFindUnique.mockResolvedValue({ ...sampleRole, IsSystem: true });
    const req = new NextRequest("http://localhost:3000/api/roles?roleId=role-id-1", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it("deletes a non-system role", async () => {
    mockRolesFindUnique.mockResolvedValue({ ...sampleRole, IsSystem: false });
    mockRolesDelete.mockResolvedValue(sampleRole);
    const req = new NextRequest("http://localhost:3000/api/roles?roleId=role-id-1", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 when roleId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/roles", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});

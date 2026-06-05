import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@/lib/db", () => ({
  db: {
    users: { findUnique: jest.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  getUserPermissions,
  hasPermission,
  hasAnyPermission,
  requirePermission,
  requireAnyPermission,
  ForbiddenError,
  invalidateUserPermissionCache,
} from "@/lib/rbac";
import { ALL_PERMISSION_KEYS, TEST_IDS } from "../fixtures/seed-test-db";

const mockFindUnique = db.users.findUnique as jest.Mock;

function mockUserWithPermissions(permissions: string[]) {
  mockFindUnique.mockResolvedValue({
    UserRole: {
      Permissions: permissions.map((key) => ({
        Permission: { PermissionKey: key },
      })),
    },
  });
}

describe("lib/rbac", () => {
  beforeEach(() => {
    invalidateUserPermissionCache();
    jest.clearAllMocks();
  });

  describe("getUserPermissions", () => {
    it("returns correct permissions for user", async () => {
      mockUserWithPermissions(["replenishment.view", "clients.view"]);
      const result = await getUserPermissions(TEST_IDS.memberUserId);
      expect(result).toEqual(["replenishment.view", "clients.view"]);
    });

    it("returns empty array for user with no role", async () => {
      mockFindUnique.mockResolvedValue({ UserRole: null });
      const result = await getUserPermissions(TEST_IDS.viewerUserId);
      expect(result).toEqual([]);
    });

    it("returns empty array for non-existent user", async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await getUserPermissions("unknown-id");
      expect(result).toEqual([]);
    });
  });

  describe("hasPermission", () => {
    it("returns true when user has the permission", async () => {
      mockUserWithPermissions(["replenishment.confirm"]);
      expect(await hasPermission(TEST_IDS.memberUserId, "replenishment.confirm")).toBe(true);
    });

    it("returns false when user lacks the permission", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      expect(await hasPermission(TEST_IDS.memberUserId, "replenishment.confirm")).toBe(false);
    });
  });

  describe("hasAnyPermission", () => {
    it("returns true when user has any of the keys", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      expect(
        await hasAnyPermission(TEST_IDS.memberUserId, ["dashboard.view", "replenishment.view"]),
      ).toBe(true);
    });

    it("returns false when user has none of the keys", async () => {
      mockUserWithPermissions(["clients.view"]);
      expect(
        await hasAnyPermission(TEST_IDS.memberUserId, ["dashboard.view", "replenishment.view"]),
      ).toBe(false);
    });

    it("returns false for empty key list", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      expect(await hasAnyPermission(TEST_IDS.memberUserId, [])).toBe(false);
    });
  });

  describe("requirePermission", () => {
    it("resolves without error when permission is present", async () => {
      mockUserWithPermissions(["settings.view"]);
      await expect(requirePermission(TEST_IDS.adminUserId, "settings.view")).resolves.toBeUndefined();
    });

    it("throws ForbiddenError when permission is missing", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      await expect(requirePermission(TEST_IDS.memberUserId, "settings.edit")).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("requireAnyPermission", () => {
    it("resolves when user has second key", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      await expect(
        requireAnyPermission(TEST_IDS.memberUserId, ["dashboard.view", "replenishment.view"]),
      ).resolves.toBeUndefined();
    });

    it("rejects when user has none of the keys", async () => {
      mockUserWithPermissions(["clients.view"]);
      await expect(
        requireAnyPermission(TEST_IDS.memberUserId, ["dashboard.view", "replenishment.view"]),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("ForbiddenError", () => {
    it("carries 403 response", () => {
      const err = new ForbiddenError("settings.edit");
      expect(err.response.status).toBe(403);
    });

    it("is instanceof Error and ForbiddenError", () => {
      const err = new ForbiddenError("some.perm");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it("includes the required permission key in the message", () => {
      const err = new ForbiddenError("roles.delete");
      expect(err.message).toContain("roles.delete");
    });
  });

  describe("caching", () => {
    it("second call within 60s does not hit DB", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      await getUserPermissions(TEST_IDS.memberUserId);
      await getUserPermissions(TEST_IDS.memberUserId);
      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("invalidateUserPermissionCache(userId) clears only that user", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      await getUserPermissions(TEST_IDS.memberUserId);
      await getUserPermissions(TEST_IDS.adminUserId);
      invalidateUserPermissionCache(TEST_IDS.memberUserId);
      await getUserPermissions(TEST_IDS.memberUserId); // should re-fetch
      // memberUserId fetched twice, adminUserId fetched once
      expect(mockFindUnique).toHaveBeenCalledTimes(3);
    });

    it("invalidateUserPermissionCache() with no arg clears all", async () => {
      mockUserWithPermissions(["replenishment.view"]);
      await getUserPermissions(TEST_IDS.memberUserId);
      await getUserPermissions(TEST_IDS.adminUserId);
      invalidateUserPermissionCache();
      await getUserPermissions(TEST_IDS.memberUserId);
      await getUserPermissions(TEST_IDS.adminUserId);
      expect(mockFindUnique).toHaveBeenCalledTimes(4);
    });
  });

  describe("super_admin scope", () => {
    it("super_admin has all permissions", async () => {
      mockUserWithPermissions(ALL_PERMISSION_KEYS);
      const perms = await getUserPermissions(TEST_IDS.superAdminUserId);
      for (const key of ALL_PERMISSION_KEYS) {
        expect(perms).toContain(key);
      }
    });
  });
});

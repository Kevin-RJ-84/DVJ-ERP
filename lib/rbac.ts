import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

type PermissionCacheEntry = {
  permissions: string[];
  expiresAt: number;
};

// Stored on globalThis so the cache survives Next.js hot-reloads in dev.
const globalForRbac = globalThis as unknown as {
  _rbacCache: Map<string, PermissionCacheEntry> | undefined;
};

function getCache(): Map<string, PermissionCacheEntry> {
  if (!globalForRbac._rbacCache) {
    globalForRbac._rbacCache = new Map();
  }
  return globalForRbac._rbacCache;
}

/**
 * Remove a specific user's cached permissions (e.g. after a role change).
 * Pass no argument to flush the entire cache.
 */
export function invalidateUserPermissionCache(userId?: string) {
  const cache = getCache();
  if (userId) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Return all permission keys held by a user via their assigned role.
 * Result is cached per userId for 60 seconds.
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const cache = getCache();
  const now = Date.now();
  const cached = cache.get(userId);

  if (cached && cached.expiresAt > now) {
    return cached.permissions;
  }

  // Single query: users → roles → role_permissions → permissions
  const user = await db.users.findUnique({
    where: { UserID: userId },
    select: {
      UserRole: {
        select: {
          Permissions: {
            select: {
              Permission: {
                select: { PermissionKey: true },
              },
            },
          },
        },
      },
    },
  });

  const permissions =
    user?.UserRole?.Permissions.map((rp) => rp.Permission.PermissionKey) ?? [];

  cache.set(userId, { permissions, expiresAt: now + CACHE_TTL_MS });
  return permissions;
}

/**
 * Return true if the user holds the given permission key.
 */
export async function hasPermission(
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionKey);
}

/** True if the user has at least one of the given keys (single `getUserPermissions` read). */
export async function hasAnyPermission(
  userId: string,
  permissionKeys: string[],
): Promise<boolean> {
  if (permissionKeys.length === 0) return false;
  const permissions = await getUserPermissions(userId);
  return permissionKeys.some((k) => permissions.includes(k));
}

// ─── ForbiddenError ───────────────────────────────────────────────────────────

/**
 * Thrown by requirePermission when the user lacks the required permission.
 * Route handlers catch this and return `e.response` directly.
 *
 * @example
 * try {
 *   await requirePermission(userId, 'replenishment.confirm');
 * } catch (e) {
 *   if (e instanceof ForbiddenError) return e.response;
 *   throw e;
 * }
 */
export class ForbiddenError extends Error {
  readonly response: NextResponse;

  constructor(permissionKey: string) {
    super(`Forbidden: missing permission '${permissionKey}'`);
    this.name = "ForbiddenError";
    this.response = NextResponse.json(
      { error: "Forbidden", required: permissionKey },
      { status: 403 },
    );
  }
}

/**
 * Assert that the user holds the given permission.
 * Throws ForbiddenError (with a 403 NextResponse payload) if not.
 */
export async function requirePermission(
  userId: string,
  permissionKey: string,
): Promise<void> {
  const allowed = await hasPermission(userId, permissionKey);
  if (!allowed) {
    throw new ForbiddenError(permissionKey);
  }
}

/**
 * Assert the user holds at least one permission. On failure, throws ForbiddenError for `reportKey`
 * (defaults to the first required key).
 */
export async function requireAnyPermission(
  userId: string,
  permissionKeys: string[],
  reportKey?: string,
): Promise<void> {
  const allowed = await hasAnyPermission(userId, permissionKeys);
  if (!allowed) {
    throw new ForbiddenError(reportKey ?? permissionKeys[0] ?? "permission");
  }
}

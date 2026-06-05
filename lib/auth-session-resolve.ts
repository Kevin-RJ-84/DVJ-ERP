import type { DashboardSession } from "@/components/layout/dashboard-session";
import { verifyAuthToken, type AppJwtPayload } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserPermissions } from "@/lib/rbac";

/** Load permissions from DB when JWT predates RBAC or was minted without keys. */
export async function enrichAuthPayload(payload: AppJwtPayload): Promise<AppJwtPayload> {
  if (payload.permissions.length > 0 || !payload.userId) {
    return payload;
  }

  const permissions = await getUserPermissions(payload.userId);
  return { ...payload, permissions };
}

export async function resolveDashboardSession(token: string | undefined): Promise<DashboardSession> {
  if (!token) return null;

  try {
    const payload = await enrichAuthPayload(await verifyAuthToken(token));
    const profile = await db.users.findUnique({
      where: { UserID: payload.userId },
      select: { AvatarKey: true },
    });
    return {
      userId: payload.userId,
      avatarKey: profile?.AvatarKey ?? null,
      role: payload.role,
      username: payload.username,
      roleId: payload.roleId,
      roleName: payload.roleName,
      permissions: payload.permissions,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
  } catch {
    return null;
  }
}

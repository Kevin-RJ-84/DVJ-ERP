import { signAuthToken, type AuthUserRow } from "@/lib/auth";
import { getUserPermissions } from "@/lib/rbac";

/** Mint JWT after login or password change; loads RBAC permission keys for the payload. */
export async function signAuthTokenForUser(user: AuthUserRow): Promise<string> {
  const permissions = await getUserPermissions(user.UserID);
  const legacyRole = user.Role === "admin" || user.Role === "member" ? user.Role : "member";

  return signAuthToken({
    userId: user.UserID,
    username: user.Username,
    roleId: user.RoleID ?? user.UserRole?.RoleID ?? null,
    roleName: user.UserRole?.RoleName ?? user.Role,
    permissions,
    role: legacyRole,
    email: user.Email,
    firstName: user.FirstName,
    lastName: user.LastName,
    isFirstLogin: user.IsFirstLogin,
  });
}

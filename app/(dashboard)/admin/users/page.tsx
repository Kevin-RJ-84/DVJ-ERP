import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { UserManagement } from "@/components/users/UserManagement";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";

export default async function UsersPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "users.view");
  if (!canAccess) redirect("/dashboard");

  const users = await db.users.findMany({
    orderBy: { CreatedAt: "desc" },
    select: {
      UserID: true,
      Username: true,
      Email: true,
      FirstName: true,
      LastName: true,
      Role: true,
      RoleID: true,
      IsActive: true,
      AvatarKey: true,
      CreatedAt: true,
      ModifiedAt: true,
      UserRole: { select: { IsSystem: true } },
    },
  });

  const initialUsers = users.map((u) => ({
    UserID: u.UserID,
    Username: u.Username,
    Email: u.Email,
    FirstName: u.FirstName,
    LastName: u.LastName,
    Role: u.Role,
    RoleID: u.RoleID,
    IsActive: u.IsActive,
    AvatarKey: u.AvatarKey,
    CreatedAt: u.CreatedAt.toISOString(),
    ModifiedAt: u.ModifiedAt.toISOString(),
    isSystemRole: u.UserRole?.IsSystem ?? false,
  }));

  const [canInvite, canEditRole, canDeactivate] = await Promise.all([
    hasPermission(session.userId, "users.invite"),
    hasPermission(session.userId, "users.edit_role"),
    hasPermission(session.userId, "users.deactivate"),
  ]);

  return (
    <GroupPageFrame className="w-full min-w-0">
      <UserManagement
        initialUsers={initialUsers}
        currentUserId={session.userId}
        canInvite={canInvite}
        canEditRole={canEditRole}
        canDeactivate={canDeactivate}
      />
    </GroupPageFrame>
  );
}

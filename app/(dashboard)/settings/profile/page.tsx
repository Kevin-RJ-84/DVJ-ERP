import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { ProfileSettingsLayout } from "@/components/settings/ProfileSettingsLayout";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";

function formatJwtSeconds(sec?: number) {
  if (typeof sec !== "number" || Number.isNaN(sec)) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(sec * 1000));
}

export default async function SettingsProfilePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const profile = await db.users.findUnique({
    where: { UserID: session.userId },
    select: { AvatarKey: true, FirstName: true, LastName: true },
  });

  const firstName = profile?.FirstName ?? session.firstName ?? "";
  const lastName = profile?.LastName ?? session.lastName ?? "";
  const email = session.email ?? "";
  const role = session.roleName ?? session.role ?? "";
  const issuedAtLabel = formatJwtSeconds(session.iat);
  const expiresAtLabel = formatJwtSeconds(session.exp);
  const isFirstLogin = Boolean(session.isFirstLogin);
  const isAdmin = ["admin", "super_admin"].includes(session.roleName ?? session.role ?? "");

  return (
    <GroupPageFrame className="w-full min-w-0">
      <ProfileSettingsLayout
        userId={session.userId}
        avatarKey={profile?.AvatarKey ?? null}
        firstName={firstName}
        lastName={lastName}
        email={email}
        role={role}
        issuedAtLabel={issuedAtLabel}
        expiresAtLabel={expiresAtLabel}
        isFirstLogin={isFirstLogin}
        isAdmin={isAdmin}
      />
    </GroupPageFrame>
  );
}

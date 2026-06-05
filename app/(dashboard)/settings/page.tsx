import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { SystemSettingsPage } from "@/components/settings/SystemSettingsPage";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function SystemSettingsRoute() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "settings.view");
  if (!canAccess) redirect("/dashboard");

  return (
    <GroupPageFrame className="w-full min-w-0">
      <SystemSettingsPage />
    </GroupPageFrame>
  );
}

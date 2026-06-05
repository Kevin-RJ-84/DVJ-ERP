import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { PendingPullbacksPage } from "@/components/replenishment/PendingPullbacksPage";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function PendingPullbacksRoutePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "replenishment.view");
  if (!canAccess) redirect("/dashboard");

  return (
    <GroupPageFrame contentFill className="w-full">
      <PendingPullbacksPage />
    </GroupPageFrame>
  );
}

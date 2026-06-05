import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { ReplenishmentV2Page } from "@/components/replenishment/ReplenishmentV2Page";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function ClientReplenishmentPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "replenishment.view");
  if (!canAccess) redirect("/dashboard");

  return (
    <GroupPageFrame contentFill>
      <Suspense fallback={null}>
        <ReplenishmentV2Page />
      </Suspense>
    </GroupPageFrame>
  );
}

import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { FactoryOrdersPage } from "@/components/replenishment/FactoryOrdersPage";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function FactoryOrdersRoutePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "replenishment.view");
  if (!canAccess) redirect("/dashboard");

  return (
    <GroupPageFrame contentFill className="w-full">
      <FactoryOrdersPage />
    </GroupPageFrame>
  );
}

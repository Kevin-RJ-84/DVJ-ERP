import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { StockReplenishmentPage } from "@/components/replenishment/StockReplenishmentPage";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function StockReplenishmentRoutePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "replenishment.view");
  if (!canAccess) redirect("/dashboard");

  const canExport = await hasPermission(session.userId, "stock_replenishment.export");

  return (
    <GroupPageFrame contentFill className="w-full">
      <StockReplenishmentPage canExport={canExport} />
    </GroupPageFrame>
  );
}

import { redirect } from "next/navigation";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { StockReviewPage } from "@/components/stock/StockReviewPage";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function StockReviewRoutePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "stock_review.view");
  if (!canAccess) redirect("/dashboard");

  const canResolve = await hasPermission(session.userId, "stock_review.resolve");

  return (
    <GroupPageFrame className="w-full" contentFill>
      <StockReviewPage canResolve={canResolve} />
    </GroupPageFrame>
  );
}

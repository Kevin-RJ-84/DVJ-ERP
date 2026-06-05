import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { getJwtCookieName } from "@/lib/auth";
import { resolveDashboardSession } from "@/lib/auth-session-resolve";
import { hasPermission } from "@/lib/rbac";

export default async function DashboardRoutePage() {
  const cookieStore = await cookies();
  const dashSession = await resolveDashboardSession(
    cookieStore.get(getJwtCookieName())?.value,
  );
  if (!dashSession) redirect("/login");

  const canAccess = await hasPermission(dashSession.userId, "dashboard.view");
  if (!canAccess) {
    if (await hasPermission(dashSession.userId, "replenishment.view")) {
      redirect("/replenishment/client");
    }
    redirect("/login");
  }

  const [
    canUploadStock,
    canUploadSales,
    canClientReplenishment,
    canStockReplenishment,
    canStockReviewList,
  ] = await Promise.all([
    hasPermission(dashSession.userId, "upload.stock"),
    hasPermission(dashSession.userId, "upload.sales"),
    hasPermission(dashSession.userId, "replenishment.view"),
    hasPermission(dashSession.userId, "stock_replenishment.view"),
    hasPermission(dashSession.userId, "stock_review.view"),
  ]);
  const canMissingStockCount = canClientReplenishment;

  return (
    <DashboardPage
      session={dashSession}
      canUploadStock={canUploadStock}
      canUploadSales={canUploadSales}
      canClientReplenishment={canClientReplenishment}
      canStockReplenishment={canStockReplenishment}
      canMissingStockCount={canMissingStockCount}
      canStockReviewList={canStockReviewList}
    />
  );
}

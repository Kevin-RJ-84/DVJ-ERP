import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requireAnyPermission, ForbiddenError } from "@/lib/rbac";
import { getStockReplenishmentReport } from "@/lib/stock-replenishment";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requireAnyPermission(auth.userId, ["stock_replenishment.view", "replenishment.view"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  try {
    const report = await getStockReplenishmentReport();
    return NextResponse.json(report);
  } catch (err) {
    console.error("stock/replenishment GET", err);
    return NextResponse.json({ message: "Failed to load stock replenishment data." }, { status: 500 });
  }
}

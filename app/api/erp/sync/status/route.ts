import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getConfig, getConfigBool, getConfigInt } from "@/lib/config";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  try {
    await requirePermission(auth.userId, "replenishment.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  try {
    const lastSync = await getConfig("erp_last_stock_sync");
    const syncEnabled = await getConfigBool("erp_sync_enabled");
    const intervalMinutes = await getConfigInt("erp_sync_interval_minutes");

    return NextResponse.json({
      lastStockSync: lastSync || null,
      syncEnabled,
      intervalMinutes,
    });
  } catch (err) {
    console.error("erp/sync/status GET", err);
    return NextResponse.json(
      { message: "Failed to load ERP sync status." },
      { status: 500 },
    );
  }
}

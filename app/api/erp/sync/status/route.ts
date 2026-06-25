import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getConfig, getConfigBool, getConfigInt } from "@/lib/config";
import { db } from "@/lib/db";

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
    const lastStockSync = await getConfig("erp_last_stock_sync");
    const lastSalesSync = await getConfig("erp_last_sales_sync");
    const syncEnabled = await getConfigBool("erp_sync_enabled");
    const intervalMinutes = await getConfigInt("erp_sync_interval_minutes");

    const progressRow = await db.system_config.findUnique({
      where: { ConfigKey: "erp_sync_progress" },
      select: { ConfigValue: true },
    });
    const syncProgress = progressRow ? parseInt(progressRow.ConfigValue, 10) : 0;

    return NextResponse.json({
      lastStockSync: lastStockSync || null,
      lastSalesSync: lastSalesSync || null,
      syncEnabled,
      intervalMinutes,
      syncProgress: Number.isFinite(syncProgress) ? syncProgress : 0,
    });
  } catch (err) {
    console.error("erp/sync/status GET", err);
    return NextResponse.json(
      { message: "Failed to load ERP sync status." },
      { status: 500 },
    );
  }
}

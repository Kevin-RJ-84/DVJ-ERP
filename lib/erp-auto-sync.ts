/**
 * Check if auto sync should run and trigger if needed
 * Called at the start of replenishment API requests
 * Non-blocking — runs in background, doesn't delay response
 */

import { getConfig, getConfigBool, getConfigInt } from "@/lib/config";
import { syncStockFromErp } from "@/lib/erp-sync";

export async function triggerAutoSyncIfDue(): Promise<void> {
  const erpConfigured = Boolean(
    process.env.ERP_API_BASE_URL &&
      process.env.ERP_USER_NAME &&
      process.env.ERP_PASSWORD,
  );
  if (!erpConfigured) return;

  try {
    const syncEnabled = await getConfigBool("erp_sync_enabled");
    if (!syncEnabled) return;

    const lastSyncStr = await getConfig("erp_last_stock_sync");
    const intervalMinutes = await getConfigInt("erp_sync_interval_minutes");

    if (lastSyncStr) {
      const lastSync = new Date(lastSyncStr);
      const minutesSinceSync = (Date.now() - lastSync.getTime()) / 1000 / 60;
      if (minutesSinceSync < intervalMinutes) return;
    }

    syncStockFromErp().catch((err) => {
      console.error("Auto ERP sync failed:", err);
    });
  } catch (err) {
    console.error("Auto sync check failed:", err);
  }
}

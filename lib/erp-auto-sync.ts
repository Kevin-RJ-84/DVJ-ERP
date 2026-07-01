/**
 * Check if auto sync should run and trigger if needed
 * Called at the start of replenishment API requests
 * Non-blocking — runs in background, doesn't delay response
 */

import { getConfig, getConfigBool, getConfigInt } from "@/lib/config";
import { syncSalesFromErp, syncStockFromErp } from "@/lib/erp-sync";

let isSyncRunning = false;

function minutesSince(iso: string): number {
  const lastSync = new Date(iso);
  return (Date.now() - lastSync.getTime()) / 1000 / 60;
}

function isSyncDue(lastSyncStr: string | null, intervalMinutes: number): boolean {
  if (!lastSyncStr) return true;
  return minutesSince(lastSyncStr) >= intervalMinutes;
}

export async function triggerAutoSyncIfDue(): Promise<void> {
  const erpConfigured = Boolean(
    process.env.ERP_API_BASE_URL &&
      process.env.ERP_USER_NAME &&
      process.env.ERP_PASSWORD,
  );
  if (!erpConfigured) return;

  if (isSyncRunning) {
    return;
  }

  try {
    const syncEnabled = await getConfigBool("erp_sync_enabled");
    if (!syncEnabled) return;

    const lastStockSyncStr = await getConfig("erp_last_stock_sync");
    const lastSalesSyncStr = await getConfig("erp_last_sales_sync");
    const intervalMinutes = await getConfigInt("erp_sync_interval_minutes");

    const stockDue = isSyncDue(lastStockSyncStr, intervalMinutes);
    const salesDue = isSyncDue(lastSalesSyncStr, intervalMinutes);
    if (!stockDue && !salesDue) return;

    isSyncRunning = true;

    const tasks: Promise<unknown>[] = [];

    if (stockDue) {
      tasks.push(
        syncStockFromErp().catch((err) => {
          console.error("Auto ERP stock sync failed:", err);
        }),
      );
    }

    if (salesDue) {
      tasks.push(
        syncSalesFromErp().catch((err) => {
          console.error("Auto ERP sales sync failed:", err);
        }),
      );
    }

    Promise.all(tasks).finally(() => {
      isSyncRunning = false;
    });
  } catch (err) {
    console.error("Auto sync check failed:", err);
  }
}

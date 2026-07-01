import { triggerAutoSyncIfDue } from "./erp-auto-sync";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let schedulerStarted = false;

export function startErpScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[ERP SCHEDULER] Started — checking every 5 minutes");

  setInterval(() => {
    triggerAutoSyncIfDue().catch((err) => {
      console.error("[ERP SCHEDULER] Check failed:", err);
    });
  }, CHECK_INTERVAL_MS);

  // Also run one check shortly after startup
  setTimeout(() => {
    triggerAutoSyncIfDue().catch((err) => {
      console.error("[ERP SCHEDULER] Initial check failed:", err);
    });
  }, 10_000);
}

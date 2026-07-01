export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startErpScheduler } = await import("./lib/erp-scheduler");
    startErpScheduler();
  }
}

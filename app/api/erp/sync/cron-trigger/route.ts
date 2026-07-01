import { NextRequest, NextResponse } from "next/server";
import { triggerAutoSyncIfDue } from "@/lib/erp-auto-sync";

/**
 * Protected by CRON_SECRET for future external cron use
 * (e.g. AWS EventBridge, cron-job.org) on serverless hosting.
 * Not used today — EC2 uses the in-process scheduler instead.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await triggerAutoSyncIfDue();
  return NextResponse.json({ success: true, checkedAt: new Date().toISOString() });
}

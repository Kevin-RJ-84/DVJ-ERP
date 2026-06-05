import { NextRequest, NextResponse } from "next/server";
import { getRecentActivity } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const limit = Math.min(
    30,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10) || 10),
  );
  const events = await getRecentActivity(limit);
  return NextResponse.json({ events });
}

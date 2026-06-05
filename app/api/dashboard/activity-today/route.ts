import { NextRequest, NextResponse } from "next/server";
import { getActivityToday } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const payload = await getActivityToday();
  return NextResponse.json(payload);
}

import { NextRequest, NextResponse } from "next/server";
import { getMemoStatusSummary } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const payload = await getMemoStatusSummary();
  return NextResponse.json(payload);
}

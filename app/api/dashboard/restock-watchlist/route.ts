import { NextRequest, NextResponse } from "next/server";
import { getRestockWatchlist } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const limit = Math.min(
    15,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "5", 10) || 5),
  );
  const payload = await getRestockWatchlist(limit);
  return NextResponse.json(payload);
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTopClients } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

const periodSchema = z.enum(["month", "last_3_months", "all_time"]);

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const p = request.nextUrl.searchParams.get("period") ?? "month";
  const period = periodSchema.safeParse(p).success ? periodSchema.parse(p) : "month";
  const lim = Math.min(
    25,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "6", 10) || 6),
  );

  const rows = await getTopClients(period, lim);
  return NextResponse.json(rows);
}

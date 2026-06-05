import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSalesByCategory } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

const periodSchema = z.enum(["week", "month", "year"]);

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const p = request.nextUrl.searchParams.get("period") ?? "month";
  const period = periodSchema.safeParse(p).success ? periodSchema.parse(p) : "month";
  const rows = await getSalesByCategory(period);
  return NextResponse.json(rows);
}

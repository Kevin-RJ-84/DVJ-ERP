import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCategoryComposition } from "@/lib/dashboard";
import { requireDashboardApi } from "@/lib/dashboard-route";

const modeSchema = z.enum(["current_year", "last_12_months"]);

export async function GET(request: NextRequest) {
  const gate = await requireDashboardApi(request);
  if ("error" in gate) return gate.error;

  const raw = request.nextUrl.searchParams.get("mode") ?? "current_year";
  const mode = modeSchema.safeParse(raw).success ? modeSchema.parse(raw) : "current_year";
  const topN = Math.min(6, Math.max(2, parseInt(request.nextUrl.searchParams.get("top") ?? "3", 10) || 3));

  const payload = await getCategoryComposition(mode, topN);
  return NextResponse.json(payload);
}

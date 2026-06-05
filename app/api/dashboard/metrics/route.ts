import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { getDashboardMetrics } from "@/lib/dashboard";
import { requireAnyPermission, ForbiddenError } from "@/lib/rbac";

const periodSchema = z.enum(["week", "month", "year"]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requireAnyPermission(auth.userId, ["dashboard.view", "replenishment.view"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const raw = request.nextUrl.searchParams.get("period") ?? "month";
  const parsed = periodSchema.safeParse(raw);
  const period = parsed.success ? parsed.data : "month";

  const payload = await getDashboardMetrics(period);
  return NextResponse.json(payload);
}

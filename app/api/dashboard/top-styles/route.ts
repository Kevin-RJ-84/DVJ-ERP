import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { getTopStyles } from "@/lib/dashboard";
import { requireAnyPermission, ForbiddenError } from "@/lib/rbac";

const periodSchema = z.enum(["year", "all_time"]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requireAnyPermission(auth.userId, ["dashboard.view", "replenishment.view"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const p = request.nextUrl.searchParams.get("period") ?? "year";
  const period = periodSchema.safeParse(p).success ? periodSchema.parse(p) : "year";
  const lim = Math.min(
    25,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "5", 10) || 5),
  );

  const rows = await getTopStyles(period, lim);
  return NextResponse.json(rows);
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { getMonthlySales } from "@/lib/dashboard";
import { requireAnyPermission, ForbiddenError } from "@/lib/rbac";

const modeSchema = z.enum(["current_year", "last_12_months"]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requireAnyPermission(auth.userId, ["dashboard.view", "replenishment.view"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const raw = request.nextUrl.searchParams.get("mode") ?? "current_year";
  const mode = modeSchema.safeParse(raw).success ? modeSchema.parse(raw) : "current_year";
  const rows = await getMonthlySales(mode);
  return NextResponse.json(rows);
}

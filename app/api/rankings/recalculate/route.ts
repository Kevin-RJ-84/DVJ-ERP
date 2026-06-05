import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { recalculateRankings } from "@/lib/rankings";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "rankings.recalculate");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  await recalculateRankings();

  return NextResponse.json({ success: true, calculatedAt: new Date() });
}

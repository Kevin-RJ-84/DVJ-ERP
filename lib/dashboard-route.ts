import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requireAnyPermission, ForbiddenError } from "@/lib/rbac";

/** Shared auth gate for all `/api/dashboard/*` routes. */
export async function requireDashboardApi(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }
  try {
    await requireAnyPermission(auth.userId, ["dashboard.view", "replenishment.view"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.response };
    throw e;
  }
  return { auth };
}

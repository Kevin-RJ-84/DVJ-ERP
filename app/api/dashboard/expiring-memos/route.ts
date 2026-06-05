import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { getExpiringMemos } from "@/lib/dashboard";
import { requireAnyPermission, ForbiddenError } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requireAnyPermission(auth.userId, ["dashboard.view", "replenishment.view"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const payload = await getExpiringMemos();
  return NextResponse.json(payload);
}

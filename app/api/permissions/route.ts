import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "roles.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const permissions = await db.permissions.findMany({
    orderBy: [{ Module: "asc" }, { PermissionKey: "asc" }],
  });

  return NextResponse.json({
    permissions: permissions.map((p) => ({
      permissionId: p.PermissionID,
      permissionKey: p.PermissionKey,
      description: p.Description,
      module: p.Module,
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

/**
 * Distinct users who appear as ReplenishedBy — for history filter dropdown.
 * Requires replenishment_history.view (same as GET /history).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment_history.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const rows = await db.replenishments.findMany({
    distinct: ["ReplenishedBy"],
    select: {
      ReplenishedBy: true,
      ReplenishedByUser: {
        select: { FirstName: true, LastName: true, Email: true },
      },
    },
  });

  const users = rows.map((r) => {
    const u = r.ReplenishedByUser;
    const label =
      `${u.FirstName} ${u.LastName}`.trim() || u.Email;
    return { userId: r.ReplenishedBy, label };
  });

  users.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  return NextResponse.json({ users });
}

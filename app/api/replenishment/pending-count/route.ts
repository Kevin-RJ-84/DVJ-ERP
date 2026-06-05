import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getPendingInvoiceRows } from "@/lib/replenishment-pending-invoices";

const activeItemWhere = {
  IsActive: true,
  Replenishment: { IsUndone: false },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const [pendingRows, pullbackAvailableCount, pbInProgressCount, factoryPendingCount] =
    await Promise.all([
      getPendingInvoiceRows(),
      db.replenishment_items.count({
        where: {
          ...activeItemWhere,
          Status: { in: ["pullback", "pullback_available"] },
        },
      }),
      db.replenishment_items.count({
        where: {
          ...activeItemWhere,
          Status: { in: ["pb_in_progress", "pending_pullback"] },
        },
      }),
      db.replenishment_items.count({
        where: {
          ...activeItemWhere,
          Status: "factory_order",
        },
      }),
    ]);

  return NextResponse.json({
    totalPendingInvoices: pendingRows.length,
    pullbackAvailableCount,
    pbInProgressCount,
    factoryPendingCount,
    permissions: auth.permissions,
    role: auth.role,
  });
}

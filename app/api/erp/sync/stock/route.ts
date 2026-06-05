import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { syncStockFromErp } from "@/lib/erp-sync";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  try {
    await requirePermission(auth.userId, "upload.stock");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  try {
    const result = await syncStockFromErp();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("erp/sync/stock POST", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}

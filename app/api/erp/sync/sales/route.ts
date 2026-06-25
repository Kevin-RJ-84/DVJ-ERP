import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { syncSalesFromErp } from "@/lib/erp-sync";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  try {
    await requirePermission(auth.userId, "upload.sales");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  try {
    const requesterIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      process.env.ERP_REMOTE_ADDRESS ??
      "";

    const result = await syncSalesFromErp(requesterIp);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("erp/sync/sales POST", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}

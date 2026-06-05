import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

/** GET — list stock rows flagged missing (for Stock Review page). */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "stock_review.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const rows = await db.stock.findMany({
    where: { IsMissing: true },
    orderBy: [{ UploadedAt: "desc" }, { StockNo: "asc" }],
    select: {
      StockNo: true,
      StyleNo: true,
      ProductDescription: true,
      UploadedAt: true,
      MissingNote: true,
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      stockNo: r.StockNo,
      styleNo: r.StyleNo,
      productDescription: r.ProductDescription,
      uploadedAt: r.UploadedAt.toISOString(),
      missingNote: r.MissingNote,
    })),
  });
}

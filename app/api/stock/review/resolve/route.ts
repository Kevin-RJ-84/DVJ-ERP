import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const bodySchema = z.object({
  stockNo: z.string().min(1),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "stock_review.resolve");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const { stockNo } = parsed.data;

  const updated = await db.stock.updateMany({
    where: { StockNo: stockNo, IsMissing: true },
    data: {
      IsMissing: false,
      MissingNote: null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ message: "Stock not found or not marked missing." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

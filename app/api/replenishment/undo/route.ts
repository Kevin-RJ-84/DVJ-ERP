import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const bodySchema = z.object({
  replenishmentIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.undo");
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

  const { replenishmentIds } = parsed.data;
  const now = new Date();

  const result = await db.replenishments.updateMany({
    where: {
      ReplenishmentID: { in: replenishmentIds },
      IsUndone: false,
    },
    data: {
      IsUndone: true,
      UndoneBy: auth.userId,
      UndoneAt: now,
    },
  });

  return NextResponse.json({ success: true, updatedCount: result.count });
}

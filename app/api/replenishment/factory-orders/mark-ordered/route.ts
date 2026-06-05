import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const bodySchema = z.object({
  itemId: z.string().uuid(),
  notes: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.confirm");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const item = await db.replenishment_items.findUnique({
    where: { ItemID: body.itemId },
    include: {
      Replenishment: { select: { IsUndone: true } },
    },
  });

  if (!item || !item.IsActive || item.Replenishment.IsUndone) {
    return NextResponse.json({ message: "Item not found." }, { status: 404 });
  }

  if (item.Status !== "factory_order") {
    return NextResponse.json(
      { message: "Only factory_order items can be marked as ordered." },
      { status: 400 },
    );
  }

  const now = new Date();

  await db.$transaction([
    db.replenishment_items.update({
      where: { ItemID: item.ItemID },
      data: {
        Status: "factory_order_placed",
        FactoryOrderPlacedAt: now,
        FactoryOrderPlacedBy: auth.userId,
        UpdatedAt: now,
        ...(body.notes ? { FactoryOrderNote: body.notes } : {}),
      },
    }),
    db.replenishment_status_log.create({
      data: {
        ItemID: item.ItemID,
        InvoiceNo: item.InvoiceNo,
        StyleNo: item.StyleNo,
        FromStatus: item.Status,
        ToStatus: "factory_order_placed",
        ChangedBy: auth.userId,
        Notes: body.notes ?? null,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}

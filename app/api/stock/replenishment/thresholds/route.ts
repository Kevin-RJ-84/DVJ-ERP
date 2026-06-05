import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

import { getManualThresholdEditorRows } from "@/lib/stock-replenishment";

const bodySchema = z.object({
  styleNo: z.string().trim().min(1),
  minQuantity: z.number().int().min(0),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "settings.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const rows = await getManualThresholdEditorRows();
  return NextResponse.json({ rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "settings.edit");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid fields.", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const styleNo = parsed.data.styleNo.trim();
  const { minQuantity } = parsed.data;

  const row = await db.stock_thresholds.upsert({
    where: { StyleNo: styleNo },
    create: {
      StyleNo: styleNo,
      MinQuantity: minQuantity,
      UpdatedByID: auth.userId,
    },
    update: {
      MinQuantity: minQuantity,
      UpdatedAt: new Date(),
      UpdatedByID: auth.userId,
    },
  });

  return NextResponse.json({
    threshold: {
      styleNo: row.StyleNo,
      minQuantity: row.MinQuantity,
      updatedAt: row.UpdatedAt.toISOString(),
    },
  });
}

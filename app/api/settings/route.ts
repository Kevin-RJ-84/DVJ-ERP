import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { invalidateConfigCache } from "@/lib/config";
import { recalculateRankings } from "@/lib/rankings";

const RANKING_KEYS = new Set([
  "use_combined_score",
  "ranking_value_metric",
  "ranking_value_weight",
  "ranking_volume_weight",
  "ranking_period",
]);

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
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

  const rows = await db.system_config.findMany({
    orderBy: [{ Module: "asc" }, { ConfigKey: "asc" }],
  });

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!grouped[row.Module]) grouped[row.Module] = [];
    grouped[row.Module].push(row);
  }

  return NextResponse.json({ config: grouped });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "settings.edit");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Missing or invalid fields.", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { key, value } = parsed.data;

  const existing = await db.system_config.findUnique({ where: { ConfigKey: key } });
  if (!existing) {
    return NextResponse.json({ message: `Config key '${key}' not found.` }, { status: 404 });
  }

  await db.system_config.update({
    where: { ConfigKey: key },
    data: { ConfigValue: value, UpdatedAt: new Date(), UpdatedByID: auth.userId },
  });

  invalidateConfigCache();

  if (RANKING_KEYS.has(key)) {
    recalculateRankings().catch((err) => {
      console.error("[rankings] recalculateRankings failed after settings update:", err);
    });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  closeToExpiryDays: z.number().int().min(0).max(365),
  isStockPullAllowed: z.boolean(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "clients.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const matchMode = searchParams.get("matchMode")?.trim().toLowerCase() ?? "contains";
  const limitRaw = Number(searchParams.get("limit"));
  const take =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : undefined;

  const clients = await db.clients.findMany({
    where: search
      ? {
          PartyName: {
            ...(matchMode === "startsWith"
              ? { startsWith: search }
              : { contains: search }),
            mode: "insensitive",
          },
        }
      : undefined,
    orderBy: [{ OverallRank: { sort: "asc", nulls: "last" } }, { PartyName: "asc" }],
    take,
    select: {
      ClientID: true,
      PartyCode: true,
      PartyName: true,
      CloseToExpiryDays: true,
      IsStockPullAllowed: true,
      CreatedAt: true,
      OverallRank: true,
      OverallScore: true,
    },
  });

  return NextResponse.json({ clients });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "clients.edit_expiry");
    await requirePermission(auth.userId, "clients.edit_pullback");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const payload = updateClientSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { message: payload.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const updated = await db.clients.update({
    where: { ClientID: payload.data.clientId },
    data: {
      CloseToExpiryDays: payload.data.closeToExpiryDays,
      IsStockPullAllowed: payload.data.isStockPullAllowed,
    },
    select: {
      ClientID: true,
      PartyCode: true,
      PartyName: true,
      CloseToExpiryDays: true,
      IsStockPullAllowed: true,
      CreatedAt: true,
      OverallRank: true,
      OverallScore: true,
    },
  });

  return NextResponse.json({
    message: "Client updated successfully.",
    client: updated,
  });
}

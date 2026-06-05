import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const CHANNEL_VALUES = ["whatsapp", "call", "email", "in_person"] as const;
const RESPONSE_VALUES = [
  "accepted",
  "rejected",
  "no_answer",
  "callback_requested",
] as const;

const bodySchema = z.object({
  itemId: z.string().uuid(),
  channel: z.enum(CHANNEL_VALUES),
  clientResponse: z.enum(RESPONSE_VALUES),
  notes: z.string().nullable(),
  salesperson: z.string().min(1),
});

const UI_CHANNEL_TO_API: Record<string, (typeof CHANNEL_VALUES)[number]> = {
  whatsapp: "whatsapp",
  call: "call",
  email: "email",
  in_person: "in_person",
  "in person": "in_person",
};

const UI_RESPONSE_TO_API: Record<string, (typeof RESPONSE_VALUES)[number]> = {
  accepted: "accepted",
  rejected: "rejected",
  no_answer: "no_answer",
  "no answer": "no_answer",
  callback_requested: "callback_requested",
  "callback requested": "callback_requested",
};

function normalizeChannel(value: string): (typeof CHANNEL_VALUES)[number] | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  return UI_CHANNEL_TO_API[key] ?? null;
}

function normalizeClientResponse(value: string): (typeof RESPONSE_VALUES)[number] | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  return UI_RESPONSE_TO_API[key] ?? null;
}

async function resolveContactUserId(
  salespersonLabel: string,
  fallbackUserId: string,
): Promise<string> {
  const t = salespersonLabel.trim();
  if (!t) return fallbackUserId;

  const activeUsers = await db.users.findMany({
    where: { IsActive: true },
    select: { UserID: true, Username: true, FirstName: true, LastName: true },
  });

  const lower = t.toLowerCase();
  for (const u of activeUsers) {
    if (u.Username.toLowerCase() === lower) return u.UserID;
    const full = `${u.FirstName ?? ""} ${u.LastName ?? ""}`.trim().toLowerCase();
    if (full === lower) return u.UserID;
    if ((u.FirstName ?? "").toLowerCase() === lower || (u.LastName ?? "").toLowerCase() === lower) {
      return u.UserID;
    }
  }
  return fallbackUserId;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.log_pullback_contact");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ message: "Invalid payload." }, { status: 400 });
  }

  const bodyObj = raw as Record<string, unknown>;
  const channelNorm =
    typeof bodyObj.channel === "string" ? normalizeChannel(bodyObj.channel) : null;
  const responseNorm =
    typeof bodyObj.clientResponse === "string"
      ? normalizeClientResponse(bodyObj.clientResponse)
      : null;

  if (!channelNorm || !responseNorm) {
    return NextResponse.json({ message: "Invalid channel or client response." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse({
    ...bodyObj,
    channel: channelNorm,
    clientResponse: responseNorm,
    notes:
      bodyObj.notes === null || bodyObj.notes === undefined
        ? null
        : String(bodyObj.notes),
    salesperson: String(bodyObj.salesperson ?? ""),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const { itemId, channel, clientResponse, notes, salesperson } = parsed.data;

  const item = await db.replenishment_items.findUnique({
    where: { ItemID: itemId },
    include: {
      Replenishment: { select: { IsUndone: true } },
    },
  });

  if (!item || !item.IsActive || item.Replenishment.IsUndone) {
    return NextResponse.json({ message: "Replenishment item not found." }, { status: 404 });
  }

  const contactedBy = await resolveContactUserId(salesperson, auth.userId);
  const now = new Date();
  const fromStatus = item.Status;
  let updatedStatus: string | null = null;

  await db.$transaction(async (tx) => {
    await tx.pullback_history.create({
      data: {
        ReplenishmentItemID: itemId,
        Channel: channel,
        ContactedBy: contactedBy,
        ClientResponse: clientResponse,
        Notes: notes?.trim() ? notes.trim() : null,
        ContactedAt: now,
      },
    });

    if (clientResponse === "accepted") {
      updatedStatus = "pullback_confirmed";
      await tx.replenishment_items.update({
        where: { ItemID: itemId },
        data: {
          Status: updatedStatus,
          PullbackStatus: "confirmed",
          UpdatedAt: now,
        },
      });
      await tx.replenishment_status_log.create({
        data: {
          ItemID: itemId,
          InvoiceNo: item.InvoiceNo,
          StyleNo: item.StyleNo,
          FromStatus: fromStatus,
          ToStatus: updatedStatus,
          ChangedBy: auth.userId,
        },
      });
    } else if (clientResponse === "rejected") {
      updatedStatus = "pullback_available";
      await tx.replenishment_items.update({
        where: { ItemID: itemId },
        data: {
          Status: updatedStatus,
          PullbackStatus: "pending",
          UpdatedAt: now,
        },
      });
      await tx.replenishment_status_log.create({
        data: {
          ItemID: itemId,
          InvoiceNo: item.InvoiceNo,
          StyleNo: item.StyleNo,
          FromStatus: fromStatus,
          ToStatus: updatedStatus,
          ChangedBy: auth.userId,
        },
      });
    }
  });

  return NextResponse.json({ success: true, updatedStatus });
}

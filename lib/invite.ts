import crypto from "crypto";
import { db } from "@/lib/db";

export const INVITE_TOKEN_BYTES = 32;
export const INVITE_EXPIRY_DAYS = 7;

export function generateInviteToken(): string {
  return crypto.randomBytes(INVITE_TOKEN_BYTES).toString("hex");
}

export function inviteTokenExpiryDate(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + INVITE_EXPIRY_DAYS);
  return expiry;
}

export function buildInviteLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return `/invite/${token}`;
  }
  return `${base}/invite/${token}`;
}

export type InviteUserRow = {
  UserID: string;
  Email: string;
  PasswordHash: string;
  InviteTokenUsed: boolean;
  InviteTokenExpiry: Date | null;
};

export async function findUserByInviteToken(
  token: string,
): Promise<InviteUserRow | null> {
  return db.users.findFirst({
    where: { InviteToken: token },
    select: {
      UserID: true,
      Email: true,
      PasswordHash: true,
      InviteTokenUsed: true,
      InviteTokenExpiry: true,
    },
  });
}

export function isInviteTokenValid(user: InviteUserRow): boolean {
  if (user.InviteTokenUsed) return false;
  if (!user.InviteTokenExpiry) return false;
  return user.InviteTokenExpiry >= new Date();
}

export async function generateUsernameForInvite(
  firstName: string,
  lastName: string,
  excludeUserId: string,
): Promise<string> {
  const base =
    firstName.trim().charAt(0).toLowerCase() +
    lastName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  if (!base || base.length < 2) {
    throw new Error("Could not generate username from name.");
  }

  async function isAvailable(username: string) {
    const existing = await db.users.findFirst({
      where: {
        Username: username,
        NOT: { UserID: excludeUserId },
      },
      select: { UserID: true },
    });
    return !existing;
  }

  if (await isAvailable(base)) {
    return base;
  }

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}${n}`;
    if (await isAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique username.");
}

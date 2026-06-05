import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getJwtCookieName, verifyAuthToken, type AppJwtPayload } from "@/lib/auth";
import { enrichAuthPayload } from "@/lib/auth-session-resolve";

/** Verified JWT from session cookie (App Router server components / pages). */
export async function getServerSession(): Promise<AppJwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getJwtCookieName())?.value;
  if (!token) {
    return null;
  }

  try {
    return await enrichAuthPayload(await verifyAuthToken(token));
  } catch {
    return null;
  }
}

/** Verified JWT payload for route handlers (`requirePermission` still authoritative). */
export async function requireAuth(request: NextRequest): Promise<AppJwtPayload | null> {
  const token = request.cookies.get(getJwtCookieName())?.value;
  if (!token) {
    return null;
  }

  try {
    return await verifyAuthToken(token);
  } catch {
    return null;
  }
}

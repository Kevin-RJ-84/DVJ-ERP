import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getJwtCookieName } from "@/lib/auth";
import { resolveDashboardSession } from "@/lib/auth-session-resolve";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getJwtCookieName())?.value;
  const session = await resolveDashboardSession(token);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({ session });
}

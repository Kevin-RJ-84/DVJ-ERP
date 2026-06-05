import { NextRequest, NextResponse } from "next/server";
import { findUserByInviteToken, isInviteTokenValid } from "@/lib/invite";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ message: "Invalid or expired invite link." }, { status: 400 });
  }

  const user = await findUserByInviteToken(token);
  if (!user || !isInviteTokenValid(user)) {
    return NextResponse.json({ message: "Invalid or expired invite link." }, { status: 400 });
  }

  return NextResponse.json({ email: user.Email });
}

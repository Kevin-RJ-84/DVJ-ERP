import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { findUserByInviteToken, isInviteTokenValid } from "@/lib/invite";

const verifySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  tempPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = verifySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const { token, email, tempPassword } = parsed.data;
  const user = await findUserByInviteToken(token.trim());
  if (!user || !isInviteTokenValid(user)) {
    return NextResponse.json(
      { message: "Invalid or expired invite link." },
      { status: 400 },
    );
  }

  if (user.Email.toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json(
      { message: "Invalid or expired invite link." },
      { status: 400 },
    );
  }

  const passwordOk = await verifyPassword(tempPassword, user.PasswordHash);
  if (!passwordOk) {
    return NextResponse.json({ message: "Incorrect password." }, { status: 401 });
  }

  return NextResponse.json({ success: true, email: user.Email });
}

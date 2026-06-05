import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  findUserByInviteToken,
  generateUsernameForInvite,
  isInviteTokenValid,
} from "@/lib/invite";
import { isValidPassword, passwordRuleMessage } from "@/lib/password";
import { isValidProfileAvatarKey } from "@/lib/profile-avatars";

const completeSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().trim().min(2, "First name must be at least 2 characters."),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters."),
  newPassword: z.string().min(8, "Password must be at least 8 characters."),
  avatarKey: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = completeSchema.safeParse(await request.json());
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Invalid request.";
    return NextResponse.json({ message: firstIssue }, { status: 400 });
  }

  const { token, firstName, lastName, newPassword, avatarKey } = parsed.data;

  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ message: passwordRuleMessage() }, { status: 400 });
  }

  if (avatarKey !== undefined && !isValidProfileAvatarKey(avatarKey)) {
    return NextResponse.json({ message: "Invalid avatar selection." }, { status: 400 });
  }

  const user = await findUserByInviteToken(token.trim());
  if (!user || !isInviteTokenValid(user)) {
    return NextResponse.json(
      { message: "Invalid or expired invite link." },
      { status: 400 },
    );
  }

  let username: string;
  try {
    username = await generateUsernameForInvite(firstName, lastName, user.UserID);
  } catch {
    return NextResponse.json(
      { message: "Could not generate a username. Check the name fields." },
      { status: 400 },
    );
  }

  await db.users.update({
    where: { UserID: user.UserID },
    data: {
      FirstName: firstName,
      LastName: lastName,
      Username: username,
      PasswordHash: await hashPassword(newPassword),
      IsFirstLogin: false,
      InviteTokenUsed: true,
      ...(avatarKey ? { AvatarKey: avatarKey } : {}),
      ModifiedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    username,
    email: user.Email,
  });
}

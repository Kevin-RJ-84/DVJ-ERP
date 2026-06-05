import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { isValidProfileAvatarKey } from "@/lib/profile-avatars";

const patchSchema = z.object({
  avatarKey: z.string().trim().min(1),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const { avatarKey } = parsed.data;
  if (!isValidProfileAvatarKey(avatarKey)) {
    return NextResponse.json({ message: "Invalid avatar selection." }, { status: 400 });
  }

  await db.users.update({
    where: { UserID: auth.userId },
    data: {
      AvatarKey: avatarKey,
      ModifiedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, avatarKey });
}

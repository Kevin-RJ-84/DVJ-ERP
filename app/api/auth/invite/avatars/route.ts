import { NextResponse } from "next/server";
import { listProfileAvatarKeys, profileAvatarPublicPath } from "@/lib/profile-avatars";

export async function GET() {
  const avatars = listProfileAvatarKeys().map((key) => ({
    key,
    url: profileAvatarPublicPath(key),
  }));

  return NextResponse.json({ avatars });
}

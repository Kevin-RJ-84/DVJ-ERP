import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { createUserAvatarSvg } from "@/lib/user-avatar";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const seed = request.nextUrl.searchParams.get("seed")?.trim();
  if (!seed) {
    return NextResponse.json({ message: "Missing seed." }, { status: 400 });
  }

  const sizeRaw = Number(request.nextUrl.searchParams.get("size") ?? "80");
  const size = Number.isFinite(sizeRaw)
    ? Math.min(256, Math.max(32, Math.round(sizeRaw)))
    : 80;

  const svg = createUserAvatarSvg({ seed, size });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}

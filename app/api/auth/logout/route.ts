import { NextResponse } from "next/server";
import { getJwtCookieName, getSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out successfully." });
  response.cookies.set({
    name: getJwtCookieName(),
    value: "",
    ...getSessionCookieOptions(0),
  });

  return response;
}

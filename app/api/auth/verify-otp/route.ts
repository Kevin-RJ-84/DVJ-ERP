import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, getHttpOnlyCookieOptions } from "@/lib/auth";

const verifyOtpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/),
});

const OTP_COOKIE_NAME = "dvj_fp_email";
const OTP_VERIFIED_COOKIE = "dvj_fp_verified";

export async function POST(request: NextRequest) {
  const parsedBody = verifyOtpSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: "Enter a valid 6-digit OTP." },
      { status: 400 },
    );
  }

  const email = request.cookies.get(OTP_COOKIE_NAME)?.value;
  if (!email) {
    return NextResponse.json(
      { message: "Password reset session expired. Start again." },
      { status: 400 },
    );
  }

  const user = await db.users.findUnique({ where: { Email: email } });
  if (
    !user ||
    !user.OtpHash ||
    !user.OtpExpiresAt ||
    user.OtpExpiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json(
      { message: "OTP is invalid or expired." },
      { status: 400 },
    );
  }

  const otpMatches = await verifyPassword(parsedBody.data.otp, user.OtpHash);
  if (!otpMatches) {
    return NextResponse.json(
      { message: "OTP is invalid or expired." },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ message: "OTP verified." });
  response.cookies.set({
    name: OTP_VERIFIED_COOKIE,
    value: "1",
    ...getHttpOnlyCookieOptions(60 * 15),
  });
  return response;
}

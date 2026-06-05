import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { isValidPassword, passwordRuleMessage } from "@/lib/password";

const resetPasswordSchema = z
  .object({
    password: z.string(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const OTP_COOKIE_NAME = "dvj_fp_email";
const OTP_VERIFIED_COOKIE = "dvj_fp_verified";

export async function POST(request: NextRequest) {
  const parsedBody = resetPasswordSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: parsedBody.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const email = request.cookies.get(OTP_COOKIE_NAME)?.value;
  const isOtpVerified = request.cookies.get(OTP_VERIFIED_COOKIE)?.value === "1";

  if (!email || !isOtpVerified) {
    return NextResponse.json(
      { message: "Password reset session expired. Start again." },
      { status: 400 },
    );
  }

  const user = await db.users.findUnique({ where: { Email: email } });
  if (!user || !user.IsActive) {
    return NextResponse.json(
      { message: "User is not eligible for password reset." },
      { status: 404 },
    );
  }

  if (!isValidPassword(parsedBody.data.password)) {
    return NextResponse.json(
      { message: passwordRuleMessage() },
      { status: 400 },
    );
  }

  const sameAsOld = await verifyPassword(parsedBody.data.password, user.PasswordHash);
  if (sameAsOld) {
    return NextResponse.json(
      { message: "New password cannot match your old password." },
      { status: 400 },
    );
  }

  await db.users.update({
    where: { UserID: user.UserID },
    data: {
      PasswordHash: await hashPassword(parsedBody.data.password),
      OtpHash: null,
      OtpExpiresAt: null,
      ModifiedAt: new Date(),
    },
  });

  const response = NextResponse.json({ message: "Password reset successful." });
  response.cookies.set({ name: OTP_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  response.cookies.set({ name: OTP_VERIFIED_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}

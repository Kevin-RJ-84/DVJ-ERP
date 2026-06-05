import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, getHttpOnlyCookieOptions, isAllowedEmailDomain } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const OTP_COOKIE_NAME = "dvj_fp_email";

function generateOtp() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function POST(request: Request) {
  const parsedBody = forgotPasswordSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: "Invalid payload." },
      { status: 400 },
    );
  }

  const email = parsedBody.data.email.toLowerCase();
  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { message: "Email domain is not allowed." },
      { status: 403 },
    );
  }

  const user = await db.users.findUnique({ where: { Email: email } });
  if (!user || !user.IsActive) {
    return NextResponse.json(
      { message: "If an account exists, OTP has been sent." },
      { status: 200 },
    );
  }

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.users.update({
    where: { UserID: user.UserID },
    data: {
      OtpHash: otpHash,
      OtpExpiresAt: otpExpiresAt,
    },
  });

  const emailResult = await sendEmail({
    to: user.Email,
    subject: "DVJ ERP password reset OTP",
    text: `Your OTP is ${otp}. It will expire in 10 minutes.`,
  });
  if (!emailResult.sent) {
    console.warn("Forgot-password email not sent:", emailResult.reason);
  }

  const response = NextResponse.json({
    message: "If an account exists, OTP has been sent.",
  });
  response.cookies.set({
    name: OTP_COOKIE_NAME,
    value: email,
    ...getHttpOnlyCookieOptions(60 * 15),
  });
  response.cookies.set({
    name: "dvj_fp_verified",
    value: "",
    path: "/",
    maxAge: 0,
  });

  return response;
}

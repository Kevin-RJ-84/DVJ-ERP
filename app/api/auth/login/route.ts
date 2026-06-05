import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getJwtCookieName,
  getSessionCookieOptions,
  isAllowedEmailDomain,
  verifyPassword,
} from "@/lib/auth";
import { signAuthTokenForUser } from "@/lib/auth-session";

const loginSchema = z.object({
  email: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().email()),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsedBody = loginSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: "Invalid login payload." },
      { status: 400 },
    );
  }

  const { email, password } = parsedBody.data;

  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { message: "Email domain is not allowed." },
      { status: 403 },
    );
  }

  const user = await db.users.findUnique({
    where: { Email: email.toLowerCase() },
    include: {
      UserRole: { select: { RoleID: true, RoleName: true } },
    },
  });

  if (!user) {
    if (process.env.NODE_ENV === "development") {
      console.info("[auth/login] failed: no user found for email", email);
    }
    return NextResponse.json(
      { message: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (!user.IsActive) {
    return NextResponse.json(
      { message: "Your account has been deactivated. Please contact your administrator." },
      { status: 403 },
    );
  }

  const passwordMatches = await verifyPassword(password, user.PasswordHash);
  if (!passwordMatches) {
    if (process.env.NODE_ENV === "development") {
      console.info("[auth/login] failed: password mismatch for", email);
    }
    return NextResponse.json(
      { message: "Invalid email or password." },
      { status: 401 },
    );
  }

  const token = await signAuthTokenForUser(user);

  const response = NextResponse.json({
    message: "Login successful.",
    redirectTo: user.IsFirstLogin ? "/change-password" : "/dashboard",
  });

  response.cookies.set({
    name: getJwtCookieName(),
    value: token,
    ...getSessionCookieOptions(),
  });

  return response;
}

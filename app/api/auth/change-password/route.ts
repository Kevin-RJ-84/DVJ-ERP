import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getJwtCookieName,
  getHttpOnlyCookieOptions,
  getSessionCookieOptions,
  hashPassword,
  verifyAuthToken,
  verifyPassword,
} from "@/lib/auth";
import { signAuthTokenForUser } from "@/lib/auth-session";
import { isValidPassword, passwordRuleMessage } from "@/lib/password";

const passwordFields = z
  .object({
    password: z.string(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const changePasswordSchema = passwordFields;

const firstLoginChangeSchema = passwordFields.extend({
  firstName: z.string().trim().min(2, "First name must be at least 2 characters."),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters."),
});

async function generateUsername(
  firstName: string,
  lastName: string,
  excludeUserId: string,
): Promise<string> {
  const base =
    firstName.charAt(0).toLowerCase() +
    lastName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  if (!base || base.length < 2) {
    throw new Error("Could not generate username from name.");
  }

  async function isAvailable(username: string) {
    const existing = await db.users.findFirst({
      where: {
        Username: username,
        NOT: { UserID: excludeUserId },
      },
      select: { UserID: true },
    });
    return !existing;
  }

  if (await isAvailable(base)) {
    return base;
  }

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}${n}`;
    if (await isAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique username.");
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: getJwtCookieName(),
    value: "",
    ...getSessionCookieOptions(0),
  });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(getJwtCookieName())?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let authPayload: Awaited<ReturnType<typeof verifyAuthToken>>;
  try {
    authPayload = await verifyAuthToken(token);
  } catch {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const user = await db.users.findUnique({ where: { UserID: authPayload.userId } });
  if (!user || !user.IsActive) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const isFirstLogin = user.IsFirstLogin;

  const parsedBody = isFirstLogin
    ? firstLoginChangeSchema.safeParse(body)
    : changePasswordSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: parsedBody.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
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
      { message: "New password must be different from your current password." },
      { status: 400 },
    );
  }

  if (isFirstLogin) {
    const { firstName, lastName } = parsedBody.data as z.infer<typeof firstLoginChangeSchema>;
    let username: string;
    try {
      username = await generateUsername(firstName, lastName, user.UserID);
    } catch {
      return NextResponse.json(
        { message: "Unable to generate a unique username. Please adjust your name." },
        { status: 400 },
      );
    }

    await db.users.update({
      where: { UserID: user.UserID },
      data: {
        FirstName: firstName,
        LastName: lastName,
        Username: username,
        PasswordHash: await hashPassword(parsedBody.data.password),
        IsFirstLogin: false,
        ModifiedAt: new Date(),
        OtpHash: null,
        OtpExpiresAt: null,
      },
    });

    const response = NextResponse.json({
      success: true,
      username,
      email: user.Email,
    });
    clearSessionCookie(response);
    return response;
  }

  const updatedUser = await db.users.update({
    where: { UserID: user.UserID },
    data: {
      PasswordHash: await hashPassword(parsedBody.data.password),
      IsFirstLogin: false,
      ModifiedAt: new Date(),
      OtpHash: null,
      OtpExpiresAt: null,
    },
    include: {
      UserRole: { select: { RoleID: true, RoleName: true } },
    },
  });

  const refreshedToken = await signAuthTokenForUser({
    UserID: updatedUser.UserID,
    Username: updatedUser.Username,
    RoleID: updatedUser.RoleID,
    Role: updatedUser.Role,
    Email: updatedUser.Email,
    FirstName: updatedUser.FirstName,
    LastName: updatedUser.LastName,
    IsFirstLogin: false,
    UserRole: updatedUser.UserRole,
  });

  const response = NextResponse.json({
    message: "Password updated successfully.",
    redirectTo: "/dashboard",
  });
  response.cookies.set({
    name: getJwtCookieName(),
    value: refreshedToken,
    ...getSessionCookieOptions(),
  });

  return response;
}

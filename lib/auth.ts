import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { compare, hash } from "bcryptjs";

const JWT_COOKIE_NAME = "dvj_session";
const JWT_EXPIRES_IN = "7d";

export type AppJwtPayload = JWTPayload & {
  userId: string;
  username: string;
  /** FK into `roles`; null when unassigned */
  roleId: string | null;
  /** `roles.RoleName` when RoleID set; otherwise mirrors legacy `users.Role` */
  roleName: string;
  /** Permission keys from RBAC for client-side UI gating (APIs still use requirePermission). */
  permissions: string[];
  /** Legacy nav gate until all callers use permissions[] */
  role: "admin" | "member";
  email: string;
  firstName: string;
  lastName: string;
  isFirstLogin: boolean;
};

/** DB row shape for issuing a session after login or password change */
export type AuthUserRow = {
  UserID: string;
  Username: string;
  RoleID: string | null;
  Role: string;
  Email: string;
  FirstName: string;
  LastName: string;
  IsFirstLogin: boolean;
  UserRole: { RoleID: string; RoleName: string } | null;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return new TextEncoder().encode(secret);
}

export async function signAuthToken(payload: AppJwtPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const p = payload as Record<string, unknown>;

  const legacyRole = p.role === "admin" || p.role === "member" ? p.role : "member";
  const permissions = Array.isArray(p.permissions)
    ? (p.permissions as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  let roleId: string | null = null;
  if (typeof p.roleId === "string") roleId = p.roleId;
  else if (p.roleId === null) roleId = null;
  else roleId = null;

  const normalized: AppJwtPayload = {
    ...payload,
    userId: String(p.userId ?? ""),
    username: typeof p.username === "string" ? p.username : "",
    roleId,
    roleName: typeof p.roleName === "string" ? p.roleName : legacyRole,
    permissions,
    role: legacyRole,
    email: String(p.email ?? ""),
    firstName: String(p.firstName ?? ""),
    lastName: String(p.lastName ?? ""),
    isFirstLogin: Boolean(p.isFirstLogin),
  };

  return normalized;
}

export async function hashPassword(value: string) {
  return hash(value, 12);
}

export async function verifyPassword(value: string, hashedValue: string) {
  return compare(value, hashedValue);
}

export function getJwtCookieName() {
  return JWT_COOKIE_NAME;
}

/** Secure cookies only when production and explicitly serving over HTTPS. */
export function isSecureSessionCookie(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_HTTPS === "true"
  );
}

export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Host-only session cookie (no `domain`) — works on localhost and LAN IPs. */
export function getSessionCookieOptions(maxAge = SESSION_COOKIE_MAX_AGE) {
  return {
    httpOnly: true as const,
    secure: isSecureSessionCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Shared httpOnly cookie attrs for auth-adjacent flows (OTP, etc.). */
export function getHttpOnlyCookieOptions(maxAge: number) {
  return getSessionCookieOptions(maxAge);
}

export function isAllowedEmailDomain(email: string) {
  const configuredDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  if (!configuredDomain) {
    return true;
  }

  const [, domain = ""] = email.toLowerCase().split("@");
  return domain === configuredDomain;
}

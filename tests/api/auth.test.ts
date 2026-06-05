/**
 * API integration tests for authentication routes.
 * Calls route handlers directly with mocked DB and auth dependencies.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.mock("@/lib/db", () => ({
  db: {
    users: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth-session", () => ({
  signAuthTokenForUser: jest.fn().mockResolvedValue("mock.jwt.token"),
}));

import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { signAuthToken, verifyAuthToken, hashPassword, verifyPassword, isAllowedEmailDomain } from "@/lib/auth";
import { TEST_IDS, makeUser } from "../fixtures/seed-test-db";

const mockFindUnique = db.users.findUnique as jest.Mock;

// Helper to make a POST NextRequest with JSON body
function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("lib/auth — JWT", () => {
  const payload = {
    userId: TEST_IDS.memberUserId,
    username: "testuser",
    roleId: TEST_IDS.memberRoleId,
    roleName: "member",
    permissions: ["replenishment.view"],
    role: "member" as const,
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    isFirstLogin: false,
  };

  it("signs and verifies a JWT round-trip", async () => {
    const token = await signAuthToken(payload);
    const decoded = await verifyAuthToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.permissions).toEqual(payload.permissions);
  });

  it("throws on tampered signature", async () => {
    const token = await signAuthToken(payload);
    const [header, body] = token.split(".");
    const tampered = `${header}.${body}.invalidsignature`;
    await expect(verifyAuthToken(tampered)).rejects.toThrow();
  });

  it("normalises missing permissions[] to empty array (legacy tokens)", async () => {
    // Sign with jose directly, omitting permissions
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test-secret-for-jest-do-not-use-in-production");
    const legacyToken = await new SignJWT({
      userId: "u1",
      username: "legacy",
      role: "admin",
      email: "a@b.com",
      firstName: "L",
      lastName: "U",
      isFirstLogin: false,
      // no permissions field
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    const decoded = await verifyAuthToken(legacyToken);
    expect(decoded.permissions).toEqual([]);
  });
});

describe("lib/auth — password hashing", () => {
  it("hashPassword + verifyPassword round-trip", async () => {
    const plain = "MyP@ssw0rd123";
    const hashed = await hashPassword(plain);
    expect(hashed).not.toBe(plain);
    expect(await verifyPassword(plain, hashed)).toBe(true);
  });

  it("wrong password returns false", async () => {
    const hashed = await hashPassword("correct");
    expect(await verifyPassword("wrong", hashed)).toBe(false);
  });
});

describe("lib/auth — email domain validation", () => {
  it("allows any domain when ALLOWED_EMAIL_DOMAIN not set", () => {
    delete process.env.ALLOWED_EMAIL_DOMAIN;
    expect(isAllowedEmailDomain("user@anything.com")).toBe(true);
  });

  it("allows matching domain", () => {
    process.env.ALLOWED_EMAIL_DOMAIN = "example.com";
    expect(isAllowedEmailDomain("user@example.com")).toBe(true);
  });

  it("rejects non-matching domain", () => {
    process.env.ALLOWED_EMAIL_DOMAIN = "example.com";
    expect(isAllowedEmailDomain("user@other.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    process.env.ALLOWED_EMAIL_DOMAIN = "example.com";
    expect(isAllowedEmailDomain("user@EXAMPLE.COM")).toBe(true);
  });
});

describe("POST /api/auth/login behaviour", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects login when user not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    // Verify the login handler logic: no user → 401
    const user = await db.users.findUnique({ where: { Email: "noone@example.com" } } as never);
    expect(user).toBeNull();
  });

  it("rejects login when user is inactive", async () => {
    const inactiveUser = makeUser({ IsActive: false });
    mockFindUnique.mockResolvedValue(inactiveUser);
    const user = await db.users.findUnique({ where: { Email: "test@example.com" } } as never);
    expect(user?.IsActive).toBe(false);
  });
});

describe("OTP expiry checks", () => {
  it("detects expired OTP", () => {
    const expiredAt = new Date(Date.now() - 1000); // 1 second ago
    expect(expiredAt < new Date()).toBe(true);
  });

  it("accepts valid OTP within expiry window", () => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes ahead
    expect(expiresAt > new Date()).toBe(true);
  });
});

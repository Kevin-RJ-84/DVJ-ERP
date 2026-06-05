/**
 * Performance budget tests for key business logic operations.
 * These run in the unit test environment (no real DB) and measure CPU-bound logic.
 */
import { describe, it, expect } from "@jest/globals";

const BUDGET_MS = {
  jwtSign: 100,
  jwtVerify: 50,
  passwordHash: 2000,
  rankingCalc: 200,
};

describe("JWT performance budget", () => {
  it(`signAuthToken completes within ${BUDGET_MS.jwtSign}ms`, async () => {
    const { signAuthToken } = await import("@/lib/auth");
    const payload = {
      userId: "uid",
      username: "u",
      roleId: null,
      roleName: "member",
      permissions: ["replenishment.view"],
      role: "member" as const,
      email: "u@example.com",
      firstName: "U",
      lastName: "U",
      isFirstLogin: false,
    };
    const start = Date.now();
    await signAuthToken(payload);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS.jwtSign);
  });

  it(`verifyAuthToken completes within ${BUDGET_MS.jwtVerify}ms for valid token`, async () => {
    const { signAuthToken, verifyAuthToken } = await import("@/lib/auth");
    const payload = {
      userId: "uid",
      username: "u",
      roleId: null,
      roleName: "member",
      permissions: [],
      role: "member" as const,
      email: "u@example.com",
      firstName: "U",
      lastName: "U",
      isFirstLogin: false,
    };
    const token = await signAuthToken(payload);
    const start = Date.now();
    await verifyAuthToken(token);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS.jwtVerify);
  });
});

describe("Password hashing performance budget", () => {
  it(`hashPassword completes within ${BUDGET_MS.passwordHash}ms (bcrypt work factor)`, async () => {
    const { hashPassword } = await import("@/lib/auth");
    const start = Date.now();
    await hashPassword("TestPassword123!");
    const elapsed = Date.now() - start;
    // bcrypt is intentionally slow; this budget catches work-factor regressions
    expect(elapsed).toBeLessThan(BUDGET_MS.passwordHash);
  });
});

describe("Replenishment calculation performance budget", () => {
  it(`pickRandom over 1000-item pool completes within ${BUDGET_MS.rankingCalc}ms`, () => {
    const pool = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
    const start = Date.now();
    // Simulate the picking logic
    const count = 50;
    const picked = new Set<string>();
    const copy = [...pool];
    for (let i = 0; i < Math.min(count, copy.length); i++) {
      const idx = Math.floor(Math.random() * (copy.length - i)) + i;
      [copy[i], copy[idx]] = [copy[idx], copy[i]];
      picked.add(copy[i]);
    }
    const elapsed = Date.now() - start;
    expect(picked.size).toBe(count);
    expect(elapsed).toBeLessThan(BUDGET_MS.rankingCalc);
  });

  it("groupBy map construction over 5000 sales rows completes within 100ms", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      StyleNo: `style-${i % 100}`,
      Metal: `metal-${i % 5}`,
      Qty: i % 10,
      TotalPrice: (i * 1.5).toFixed(2),
    }));

    const start = Date.now();
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.StyleNo;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    const elapsed = Date.now() - start;

    expect(grouped.size).toBe(100);
    expect(elapsed).toBeLessThan(100);
  });
});

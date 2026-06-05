/**
 * E2E smoke tests for settings API endpoints (unauthenticated boundary).
 */
import { test, expect } from "@playwright/test";

test.describe("Settings API — unauthenticated boundary", () => {
  test("GET /api/settings without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/settings");
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/settings without auth returns 401", async ({ request }) => {
    const res = await request.patch("/api/settings", {
      data: { key: "default_group_by", value: "StyleNo" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Users API — unauthenticated boundary", () => {
  test("GET /api/users without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/users");
    expect(res.status()).toBe(401);
  });

  test("POST /api/users without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/users", {
      data: { email: "hacker@example.com", role: "admin" },
    });
    expect(res.status()).toBe(401);
  });
});

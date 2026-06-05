/**
 * E2E smoke tests for roles API endpoints (unauthenticated boundary).
 */
import { test, expect } from "@playwright/test";

test.describe("Roles API — unauthenticated boundary", () => {
  test("GET /api/roles without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/roles");
    expect(res.status()).toBe(401);
  });

  test("POST /api/roles without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/roles", {
      data: { roleName: "hacker_role" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/roles without auth returns 401", async ({ request }) => {
    const res = await request.delete("/api/roles?roleId=some-id");
    expect(res.status()).toBe(401);
  });
});

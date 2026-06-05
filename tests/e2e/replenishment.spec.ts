/**
 * E2E smoke tests for the replenishment page (requires authenticated session).
 * These tests run against the dev server and need a seeded test user.
 */
import { test, expect } from "@playwright/test";

// These tests depend on a running dev server and a valid test user.
// Skip gracefully if the app is unreachable (CI without seeded DB).
test.describe("Replenishment page — unauthenticated", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/replenishment/client");
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });
});

test.describe("Replenishment API — public endpoint behaviour", () => {
  test("GET /api/replenishment/v2 without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/replenishment/v2?clientId=00000000-0000-0000-0000-000000000001&fromDate=2026-01-01&toDate=2026-01-31&groupBy=StyleNo");
    expect(res.status()).toBe(401);
  });

  test("POST /api/replenishment/confirm without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/replenishment/confirm", {
      data: { groupField: "StyleNo", rows: [] },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/replenishment/undo without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/replenishment/undo", {
      data: { replenishmentIds: ["fake-id"] },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/replenishment/history without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/replenishment/history");
    expect(res.status()).toBe(401);
  });
});

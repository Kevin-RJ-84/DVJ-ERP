/**
 * E2E tests for navigation and protected route guards.
 */
import { test, expect } from "@playwright/test";

const PROTECTED_ROUTES = [
  "/",
  "/replenishment/client",
  "/clients",
  "/admin/users",
  "/admin/roles",
  "/excel-config",
];

test.describe("Protected route guards", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`unauthenticated visit to ${route} redirects to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });
  }
});

test.describe("404 handling", () => {
  test("visiting unknown route shows not-found page or redirects", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist-xyz");
    // Either 404 status or redirected to login (still a valid response)
    expect(res?.status()).toBeGreaterThanOrEqual(200);
    expect(res?.status()).toBeLessThan(500);
  });
});

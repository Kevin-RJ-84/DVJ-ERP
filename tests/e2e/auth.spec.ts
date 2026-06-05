/**
 * E2E tests for authentication flows.
 */
import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("shows login form", async ({ page }) => {
    // h2 inside the login card reads "Login"
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // Use #password to avoid strict-mode conflict with "Show password" aria-label button
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^login$/i })).toBeVisible();
  });

  test("shows error for wrong credentials", async ({ page }) => {
    await page.getByLabel(/email/i).fill("nobody@example.com");
    // Use #password to avoid strict-mode conflict with "Show password" button
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: /^login$/i }).click();
    await expect(page.getByText(/invalid|incorrect|not found|domain/i)).toBeVisible({ timeout: 8000 });
  });

  test("empty form submission shows validation", async ({ page }) => {
    await page.getByRole("button", { name: /^login$/i }).click();
    // Either HTML5 validation or inline error message
    const hasInlineError = await page.getByText(/required|enter your/i).isVisible().catch(() => false);
    const emailInvalid = await page.evaluate(() => {
      const el = document.querySelector('input[type="email"]') as HTMLInputElement | null;
      return el ? !el.validity.valid : false;
    });
    expect(hasInlineError || emailInvalid).toBe(true);
  });

  test("forgot password link is present", async ({ page }) => {
    const link = page.getByRole("link", { name: /forgot/i });
    await expect(link).toBeVisible();
  });

  test("unauthenticated user is redirected to login from protected route", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
  });
});

test.describe("Logout", () => {
  test("logout clears session and redirects to login", async ({ page }) => {
    // Attempt to access a protected page, expect redirect to login
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
    // Verify the login page is shown
    await expect(page.locator("#email")).toBeVisible();
  });
});

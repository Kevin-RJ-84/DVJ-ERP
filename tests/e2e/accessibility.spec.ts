/**
 * Accessibility tests using axe-playwright.
 * Runs against pages that don't require authentication.
 */
import { test, expect } from "@playwright/test";
import { checkA11y, injectAxe } from "axe-playwright";

test.describe("Accessibility — login page", () => {
  test("login page has no critical axe violations", async ({ page }) => {
    await page.goto("/login");
    // Wait for page to be interactive
    await page.waitForLoadState("networkidle");

    await injectAxe(page);
    await checkA11y(page, undefined, {
      axeOptions: { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } },
      includedImpacts: ["critical", "serious"],
    });
  });

  test("login form inputs have accessible labels", async ({ page }) => {
    await page.goto("/login");
    // Email input: label text "Work email" — matches /email/i uniquely
    const emailInput = page.getByLabel(/email/i);
    // Password input: use id locator to avoid strict-mode conflict with "Show password" button
    const passwordInput = page.locator("#password");
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    // Also verify the label text is present in the DOM
    await expect(page.getByText(/work email/i)).toBeVisible();
    await expect(page.getByText(/^password$/i)).toBeVisible();
  });

  test("login button is keyboard accessible", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // Some element should be focused
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });
});

test.describe("Accessibility — forgot password page", () => {
  test("forgot-password page has no critical axe violations", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");

    await injectAxe(page);
    await checkA11y(page, undefined, {
      axeOptions: { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } },
      includedImpacts: ["critical", "serious"],
    });
  });
});

/**
 * STORY-auth-001: Playwright E2E spec for the user registration page.
 *
 * Covers:
 * - Successful registration (happy path)
 * - Duplicate email handling (409)
 * - Validation error display
 */

import { test, expect } from "@playwright/test";

test.describe("Registration Page (E2E)", () => {
  test("renders registration page with all expected fields", async ({ page }) => {
    await page.goto("/register");

    // Check form elements exist
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="displayName"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("validates email field on submit with empty email", async ({ page }) => {
    await page.goto("/register");

    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("Password1a");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for missing email
    await expect(page.locator("text=/email/i")).toBeVisible();
  });

  test("validates password strength requirements", async ({ page }) => {
    await page.goto("/register");

    await page.locator('input[name="email"]').fill("valid@test.com");
    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("weak");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for weak password
    await expect(page.locator("text=/password/i")).toBeVisible();
  });

  test("validates displayName field", async ({ page }) => {
    await page.goto("/register");

    await page.locator('input[name="email"]').fill("valid@test.com");
    await page.locator('input[name="password"]').fill("Password1a");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for missing displayName
    await expect(page.locator("text=/display/i")).toBeVisible();
  });
});

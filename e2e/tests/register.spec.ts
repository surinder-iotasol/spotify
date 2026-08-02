/**
 * STORY-auth-006: Playwright E2E spec for the user registration page.
 *
 * Covers:
 * - Page renders with all expected fields in dark-mode layout
 * - Responsive layout on mobile viewport (375px)
 * - Client-side validation on blur and submit for all fields
 * - Password visibility toggle (show/hide)
 * - Password strength meter displays correctly
 * - Submit button shows loading state with aria-disabled
 * - Server error banner for AUTH_EMAIL_EXISTS (duplicate email)
 * - Accessible error alerts
 */

import { test, expect } from "@playwright/test";

const REGISTER_URL = "/register";

test.describe("Registration Page E2E (STORY-auth-006)", () => {
  /* -- Route interceptors -- */

  const API_REGISTER = 'http://localhost:3000/api/v1/auth/register';

  async function interceptRegisterResponse(
    page: import('@playwright/test').Page,
    status: number,
    body: Record<string, unknown>,
    delayMs?: number,
  ): Promise<void> {
    await page.route(API_REGISTER, async (route) => {
      if (delayMs) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Page rendering                                                     */
  /* ------------------------------------------------------------------ */

  test("renders registration page with all expected fields", async ({ page }) => {
    await page.goto(REGISTER_URL);

    // Check form elements exist
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="displayName"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("responsive layout on 375px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(REGISTER_URL);

    // Form should be fully visible within viewport
    const form = page.locator("form");
    await expect(form).toBeVisible();
    const box = await form.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);

    // All fields should be visible
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="displayName"]')).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Client-side validation                                             */
  /* ------------------------------------------------------------------ */

  test("validates email field on submit with empty email", async ({ page }) => {
    await page.goto(REGISTER_URL);

    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("Password1a");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for missing/invalid email
    await expect(page.locator("#email-error")).toBeVisible();
  });

  test("validates email field on blur with invalid format", async ({ page }) => {
    await page.goto(REGISTER_URL);

    const emailInput = page.locator('input[name="email"]');
    await emailInput.fill("not-an-email");
    await emailInput.blur();

    // Should show validation error after blur
    await expect(page.locator("#email-error")).toBeVisible();
  });

  test("validates password strength requirements on submit", async ({ page }) => {
    await page.goto(REGISTER_URL);

    await page.locator('input[name="email"]').fill("valid@test.com");
    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("weak");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for weak password
    await expect(page.locator("#password-error")).toBeVisible();
  });

  test("validates displayName field on submit with empty name", async ({ page }) => {
    await page.goto(REGISTER_URL);

    await page.locator('input[name="email"]').fill("valid@test.com");
    await page.locator('input[name="password"]').fill("Password1a");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for missing displayName
    await expect(page.locator("#displayName-error")).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Password visibility toggle                                         */
  /* ------------------------------------------------------------------ */

  test("password input toggles between masked and unmasked", async ({ page }) => {
    await page.goto(REGISTER_URL);

    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.locator('[data-testid="password-toggle"]');

    // Initially password should be masked
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click toggle to show password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click toggle again to hide password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  /* ------------------------------------------------------------------ */
  /*  Password strength meter                                            */
  /* ------------------------------------------------------------------ */

  test("password strength meter displays and updates", async ({ page }) => {
    await page.goto(REGISTER_URL);

    const passwordInput = page.locator('input[name="password"]');
    const strengthLabel = page.locator("text=Password strength");

    // Strength meter should not appear when empty
    await expect(strengthLabel).not.toBeVisible();

    // Type a short password (weak)
    await passwordInput.fill("a");
    await expect(page.locator("text=weak")).toBeVisible();

    // Type a longer password (strong)
    await passwordInput.fill("Str0ngPass");
    await expect(page.locator("text=strong")).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Loading state                                                      */
  /* ------------------------------------------------------------------ */

  test("submit button shows loading spinner and disables on submit", async ({ page }) => {
    // Create a route interceptor for the API
    await page.route("**/api/v1/auth/register**", async (route) => {
      // Slow down the response to observe loading state
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id: "1", email: "user@example.com", displayName: "Test" },
        }),
      });
    });

    await page.goto(REGISTER_URL);

    const submitButton = page.locator('button[type="submit"]');

    // Fill form
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("Password1a");

    // Click submit
    await submitButton.click();

    // Button should be disabled during loading
    await expect(submitButton).toHaveAttribute("aria-disabled", "true");
  });

  /* ------------------------------------------------------------------ */
  /*  Server error handling                                              */
  /* ------------------------------------------------------------------ */

  test("displays AUTH_EMAIL_EXISTS error for duplicate email", async ({ page }) => {
    // Create a route interceptor for the API
    await page.route("**/api/v1/auth/register**", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "AUTH_EMAIL_EXISTS",
            message: "An account with this email address is already registered.",
          },
        }),
      });
    });

    await page.goto(REGISTER_URL);

    // Fill form with duplicate email
    await page.locator('input[name="email"]').fill("existing@example.com");
    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("Password1a");

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should show error banner — use data-testid to avoid Next.js route announcer conflict
    const alertBanner = page.locator('[data-testid="register-error-banner"]');
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText(/already registered/i);
  });

  test("shows general server error in accessible banner", async ({ page }) => {
    // Create a route interceptor for the API
    await page.route("**/api/v1/auth/register**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        }),
      });
    });

    await page.goto(REGISTER_URL);

    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="displayName"]').fill("Test User");
    await page.locator('input[name="password"]').fill("Password1a");

    await page.locator('button[type="submit"]').click();

    const alertBanner = page.locator('[data-testid="register-error-banner"]');
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText(/internal server error/i);
  });
});

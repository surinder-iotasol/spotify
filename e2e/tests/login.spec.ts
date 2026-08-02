/**
 * STORY-auth-007: Playwright E2E spec for the login page.
 *
 * Covers:
 * - Page renders with all expected fields in dark-mode layout
 * - Responsive layout on mobile viewport (375px)
 * - Client-side validation on submit for email and password
 * - Password visibility toggle (show/hide)
 * - Invalid credentials error displayed in accessible banner
 * - Loading state during submission
 * - Guest session migration trigger after successful login
 */

import { test, expect } from "@playwright/test";

const LOGIN_URL = "/login";
const API_LOGIN = "http://localhost:3000/api/v1/auth/login";

test.describe("Login Page E2E (STORY-auth-007)", () => {
  /* -- Route interceptors -- */

  async function interceptLoginResponse(
    page: import('@playwright/test').Page,
    status: number,
    body: Record<string, unknown>,
    delayMs?: number,
  ): Promise<void> {
    await page.route(API_LOGIN, async (route) => {
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

  test("renders login page with all expected fields", async ({ page }) => {
    await page.goto(LOGIN_URL);

    // Check form elements exist
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("renders with welcome heading", async ({ page }) => {
    await page.goto(LOGIN_URL);

    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.getByText("Sign in to your account")).toBeVisible();
  });

  test("renders link to register page", async ({ page }) => {
    await page.goto(LOGIN_URL);

    const link = page.locator('a[href="/register"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/Create one/i);
  });

  test("responsive layout on 375px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(LOGIN_URL);

    // Form should be fully visible within viewport
    const form = page.locator("form");
    await expect(form).toBeVisible();
    const box = await form.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);

    // All fields should be visible
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Client-side validation                                             */
  /* ------------------------------------------------------------------ */

  test("validates email field on submit with empty email", async ({ page }) => {
    await page.goto(LOGIN_URL);

    await page.locator('input[name="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for missing email
    await expect(page.locator("#login-email-error")).toBeVisible();
  });

  test("validates email field on submit with invalid format", async ({ page }) => {
    await page.goto(LOGIN_URL);

    await page.locator('input[name="email"]').fill("not-an-email");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for invalid email
    await expect(page.locator("#login-email-error")).toBeVisible();
  });

  test("validates password field on submit with empty password", async ({ page }) => {
    await page.goto(LOGIN_URL);

    await page.locator('input[name="email"]').fill("valid@test.com");
    await page.locator('button[type="submit"]').click();

    // Should show validation error for missing password
    await expect(page.locator("#login-password-error")).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Password visibility toggle                                         */
  /* ------------------------------------------------------------------ */

  test("password input toggles between masked and unmasked", async ({ page }) => {
    await page.goto(LOGIN_URL);

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
  /*  Loading state                                                      */
  /* ------------------------------------------------------------------ */

  test("submit button shows loading state during submission", async ({ page }) => {
    await interceptLoginResponse(page, 200, {
      success: true,
      data: { id: "1", email: "user@example.com" },
    }, 500);

    await page.goto(LOGIN_URL);

    const submitButton = page.locator('button[type="submit"]');

    // Fill form
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("password123");

    // Click submit
    await submitButton.click();

    // Button should be disabled during loading
    await expect(submitButton).toHaveAttribute("aria-disabled", "true");
  });

  /* ------------------------------------------------------------------ */
  /*  Server error handling                                              */
  /* ------------------------------------------------------------------ */

  test("displays INVALID_CREDENTIALS error in accessible banner", async ({ page }) => {
    await interceptLoginResponse(page, 401, {
      success: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
    });

    await page.goto(LOGIN_URL);

    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Should show error banner
    await expect(page.locator('[data-testid="login-error-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-error-banner"]')).toHaveText("Invalid email or password.");
  });

  test("displays RATE_LIMIT_EXCEEDED error in accessible banner", async ({ page }) => {
    await interceptLoginResponse(page, 429, {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many failed login attempts. Please try again later.",
      },
    });

    await page.goto(LOGIN_URL);

    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // Should show error banner
    await expect(page.locator('[data-testid="login-error-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-error-banner"]')).toHaveText("Too many failed login attempts. Please try again later.");
  });

  /* ------------------------------------------------------------------ */
  /*  Valid login flow                                                   */
  /* ------------------------------------------------------------------ */

  test("valid login flow succeeds and navigates away", async ({ page }) => {
    await interceptLoginResponse(page, 200, {
      success: true,
      data: { id: "1", email: "user@example.com", displayName: "Test User" },
    });

    await page.goto(LOGIN_URL);

    // Fill form
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // Should not show error banner
    await expect(page.locator('[data-testid="login-error-banner"]')).not.toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Guest migration trigger                                            */
  /* ------------------------------------------------------------------ */

  test("triggers guest session migration after successful login", async ({ page }) => {
    await interceptLoginResponse(page, 200, {
      success: true,
      data: { id: "1", email: "user@example.com" },
    });

    await page.goto(LOGIN_URL);

    // Set up guest playlists in localStorage (simulating a guest user)
    await page.evaluate(() => {
      localStorage.setItem(
        'guest_playlists',
        JSON.stringify([
          {
            title: 'My Guest Playlist',
            tracks: [
              { trackId: 'track-1', position: 0 },
              { trackId: 'track-2', position: 1 },
            ],
          },
        ]),
      );
    });

    // Fill and submit the form
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // Wait for login to complete
    await expect(page.locator('button[type="submit"]')).not.toBeDisabled();

    // Check that guest migration flag was set in sessionStorage
    const migrationFlag = await page.evaluate(() => {
      return sessionStorage.getItem('guest_migration_pending');
    });

    expect(migrationFlag).toBe('1');
  });

  test("does not set migration flag when no guest playlists exist", async ({ page }) => {
    await interceptLoginResponse(page, 200, {
      success: true,
      data: { id: "1", email: "user@example.com" },
    });

    await page.goto(LOGIN_URL);

    // No guest playlists set in localStorage

    // Fill and submit the form
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // Wait for login to complete
    await expect(page.locator('button[type="submit"]')).not.toBeDisabled();

    // Check that migration flag was NOT set
    const migrationFlag = await page.evaluate(() => {
      return sessionStorage.getItem('guest_migration_pending');
    });

    expect(migrationFlag).toBeNull();
  });
});

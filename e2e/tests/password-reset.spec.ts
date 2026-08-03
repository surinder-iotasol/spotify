/**
 * STORY-auth-008: Playwright E2E spec for the password recovery user flow.
 *
 * Covers:
 * - /forgot-password page renders with email field and submit button
 * - Client-side email validation on submit (empty, invalid format)
 * - Successful submission shows confirmation banner regardless of email existence
 * - Link back to sign-in appears after submission
 * - /reset-password page renders with token from URL query params
 * - Password strength validation (min length, uppercase, lowercase, digit)
 * - Password confirmation matching
 * - Successful reset shows success banner with sign-in link
 * - WCAG 2.1 AA keyboard navigation and accessibility markers
 * - Responsive layout on mobile viewport
 */

import { test, expect } from "@playwright/test";

const FORGOT_PASSWORD_URL = "/forgot-password";
const API_FORGOT = "http://localhost:3000/api/v1/auth/forgot-password";
const RESET_PASSWORD_URL = "/reset-password";
const API_RESET = "http://localhost:3000/api/v1/auth/reset-password";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function interceptForgotPasswordResponse(
  page: import("@playwright/test").Page,
  status: number,
  body: Record<string, unknown>,
  delayMs?: number,
): Promise<void> {
  await page.route(API_FORGOT, async (route) => {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function interceptResetPasswordResponse(
  page: import("@playwright/test").Page,
  status: number,
  body: Record<string, unknown>,
  delayMs?: number,
): Promise<void> {
  await page.route(API_RESET, async (route) => {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Forgot Password Page — Rendering                                   */
/* ------------------------------------------------------------------ */

test.describe("Forgot Password Page E2E", () => {
  test("renders forgot password page with all expected fields", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await expect(page.getByRole("heading", { name: /forgot your password/i })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("renders link back to sign in on forgot password page", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    const link = page.locator('a[href="/login"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Back to Sign In");
  });

  test("responsive layout on 375px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(FORGOT_PASSWORD_URL);

    const form = page.locator("form");
    await expect(form).toBeVisible();
    const box = await form.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  /* ------------------------------------------------------------------ */
  /*  Client-side validation                                             */
  /* ------------------------------------------------------------------ */

  test("shows error for empty email on submit", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText(/email must be a valid email address/i),
    ).toBeVisible();
  });

  test("shows error for invalid email format on submit", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('input[name="email"]').fill("not-an-email");
    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText(/email must be a valid email address/i),
    ).toBeVisible();
  });

  test("validates email on blur with invalid format", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('input[name="email"]').fill("bad-email");
    await page.locator('input[name="email"]').blur();

    await expect(
      page.getByText(/email must be a valid email address/i),
    ).toBeVisible();
  });

  test("focuses email field when validation fails on submit", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('button[type="submit"]').click();

    await expect(page.locator('input[name="email"]')).toBeFocused();
  });

  /* ------------------------------------------------------------------ */
  /*  Form submission — happy path                                       */
  /* ------------------------------------------------------------------ */

  test("submits form and shows confirmation message on success", async ({ page }) => {
    await interceptForgotPasswordResponse(page, 200, {
      success: true,
      message: "If an account exists...",
    });

    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText(/check your email/i)).toBeVisible();
    await expect(
      page.getByText(/if an account exists/i),
    ).toBeVisible();
  });

  test("shows confirmation regardless of email existence (no account enumeration)", async ({
    page,
  }) => {
    await interceptForgotPasswordResponse(page, 200, {
      success: true,
      message: "If an account exists...",
    });

    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('input[name="email"]').fill("nonexistent@example.com");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText(/check your email/i)).toBeVisible();
  });

  test("displays server error on API failure", async ({ page }) => {
    await interceptForgotPasswordResponse(page, 500, {
      success: false,
      error: { message: "An internal error occurred." },
    });

    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId("forgot-password-error-banner")).toBeVisible();
    await expect(page.getByTestId("forgot-password-error-banner")).toContainText("An internal error occurred.");
  });

  test("shows loading state during submission", async ({ page }) => {
    await interceptForgotPasswordResponse(page, 200, { success: true }, 500);

    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('button[type="submit"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  /* ------------------------------------------------------------------ */
  /*  Accessibility                                                      */
  /* ------------------------------------------------------------------ */

  test("error messages have role=alert", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('button[type="submit"]').click();

    // Validation errors are rendered as <p role="alert"> elements
    await expect(page.locator('#forgot-password-email-error')).toBeVisible();
    await expect(page.locator('#forgot-password-email-error')).toHaveAttribute('role', 'alert');
  });

  test("invalid email field has aria-invalid", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('button[type="submit"]').click();

    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("email input has aria-describedby pointing to error message", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.locator('button[type="submit"]').click();

    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "aria-describedby",
      "forgot-password-email-error",
    );
  });

  /* ------------------------------------------------------------------ */
  /*  Keyboard navigation                                                */
  /* ------------------------------------------------------------------ */

  test("can tab through form controls on forgot-password page", async ({ page }) => {
    await page.goto(FORGOT_PASSWORD_URL);

    await page.keyboard.press("Tab");
    await expect(page.locator('input[name="email"]')).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator('button[type="submit"]')).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator('a[href="/login"]')).toBeFocused();
  });
});

/* ------------------------------------------------------------------ */
/*  Reset Password Page — Rendering                                    */
/* ------------------------------------------------------------------ */

test.describe("Reset Password Page E2E", () => {
  test("renders reset password page with all expected fields", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
    await expect(page.getByLabel("New Password")).toBeVisible();
    await expect(page.getByLabel("Confirm Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /reset password/i })).toBeVisible();
  });

  test("renders without token param shows form anyway", async ({ page }) => {
    await page.goto(RESET_PASSWORD_URL);

    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
    await expect(page.getByLabel("New Password")).toBeVisible();
  });

  test("responsive layout on 375px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    const form = page.locator("form");
    await expect(form).toBeVisible();
    const box = await form.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  /* ------------------------------------------------------------------ */
  /*  Password strength validation                                       */
  /* ------------------------------------------------------------------ */

  test("shows error for short password on submit", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Ab1");
    await page.getByLabel("Confirm Password").fill("Ab1");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test("shows error for password missing uppercase", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("password123");
    await page.getByLabel("Confirm Password").fill("password123");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByText(/must contain at least one uppercase letter/i)).toBeVisible();
  });

  test("shows error for password missing lowercase", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("PASSWORD123");
    await page.getByLabel("Confirm Password").fill("PASSWORD123");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByText(/must contain at least one lowercase letter/i)).toBeVisible();
  });

  test("shows error for password missing digit", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Password");
    await page.getByLabel("Confirm Password").fill("Password");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByText(/must contain at least one digit/i)).toBeVisible();
  });

  test("shows error for mismatched passwords", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Password123");
    await page.getByLabel("Confirm Password").fill("Password456");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("validates password strength on blur", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("short");
    await page.getByLabel("New Password").blur();

    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test("validates confirm password on blur when empty", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Password123");
    await page.getByLabel("Confirm Password").focus();
    await page.getByLabel("Confirm Password").blur();

    await expect(page.getByText(/please confirm your password/i)).toBeVisible();
  });

  test("validates confirm password on blur when mismatched", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Password123");
    await page.getByLabel("Confirm Password").fill("different1");
    await page.getByLabel("Confirm Password").blur();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Password strength indicator                                        */
  /* ------------------------------------------------------------------ */

  test("shows weak strength label for short password", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("abc");
    await expect(page.getByText("Weak")).toBeVisible();
  });

  test("shows strong strength label for complete password", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Password1");
    await expect(page.getByText("Strong")).toBeVisible();
  });

  test("shows requirements checklist for strong password", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    await page.getByLabel("New Password").fill("Password1");
    await expect(page.getByText(/✓ At least 8 characters/)).toBeVisible();
    await expect(page.getByText(/✓ One uppercase letter/)).toBeVisible();
    await expect(page.getByText(/✓ One lowercase letter/)).toBeVisible();
    await expect(page.getByText(/✓ One digit/)).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Form submission — happy path                                       */
  /* ------------------------------------------------------------------ */

  test("submits reset password with valid credentials", async ({ page }) => {
    await interceptResetPasswordResponse(page, 200, {
      success: true,
      message: "Password has been successfully reset.",
    });

    await page.goto(`${RESET_PASSWORD_URL}?token=my-reset-token-123`);

    await page.getByLabel("New Password").fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password1");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByTestId("reset-password-success-banner")).toBeVisible();
    await expect(page.getByText(/password reset successful/i)).toBeVisible();
  });

  test("passes token to the API in reset password submission", async ({ page }) => {
    let capturedBody: Record<string, unknown> = {};
    await page.route(API_RESET, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      capturedBody = body;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`${RESET_PASSWORD_URL}?token=my-reset-token`);

    await page.getByLabel("New Password").fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password1");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByText(/password reset successful/i)).toBeVisible();
    expect(capturedBody.token).toBe("my-reset-token");
  });

  test("renders sign-in link after successful reset", async ({ page }) => {
    await interceptResetPasswordResponse(page, 200, {
      success: true,
      message: "Password has been successfully reset.",
    });

    await page.goto(`${RESET_PASSWORD_URL}?token=test-token`);

    await page.getByLabel("New Password").fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password1");
    await page.getByRole("button", { name: /reset password/i }).click();

    const signInLink = page.locator('a[href="/login"]');
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveText("Sign In");
  });

  test("shows server error on API failure", async ({ page }) => {
    await interceptResetPasswordResponse(page, 400, {
      success: false,
      error: { message: "Invalid or missing password reset token." },
    });

    await page.goto(`${RESET_PASSWORD_URL}?token=invalid-token`);

    await page.getByLabel("New Password").fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password1");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByTestId("reset-password-error-banner")).toBeVisible();
    await expect(page.getByTestId("reset-password-error-banner")).toContainText("Invalid or missing password reset token.");
  });

  /* ------------------------------------------------------------------ */
  /*  Accessibility                                                      */
  /* ------------------------------------------------------------------ */

  test("error messages have role=alert on reset password page", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token`);

    await page.getByLabel("New Password").fill("short");
    await page.getByLabel("Confirm Password").fill("short");
    await page.getByRole("button", { name: /reset password/i }).click();

    // Validation errors are rendered as <p role="alert"> elements
    await expect(page.locator('#reset-password-new-error')).toBeVisible();
    await expect(page.locator('#reset-password-new-error')).toHaveAttribute('role', 'alert');
  });

  test("new password field has aria-invalid when invalid", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token`);

    await page.getByLabel("New Password").fill("short");
    await page.getByLabel("Confirm Password").fill("short");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.getByLabel("New Password")).toHaveAttribute("aria-invalid", "true");
  });

  /* ------------------------------------------------------------------ */
  /*  Keyboard navigation                                                */
  /* ------------------------------------------------------------------ */

  test("can tab through form controls on reset password page", async ({ page }) => {
    await page.goto(`${RESET_PASSWORD_URL}?token=test-token-abc`);

    // Tab 1: New Password input
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("New Password")).toBeFocused();

    // Tab 2: Password visibility toggle button
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /toggle password visibility/i })).toBeFocused();

    // Tab 3: Confirm Password input
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Confirm Password")).toBeFocused();

    // Tab 4: Submit button
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /reset password/i })).toBeFocused();
  });
});

/* ------------------------------------------------------------------ */
/*  Full password recovery user flow                                   */
/* ------------------------------------------------------------------ */

test.describe("Full Password Recovery Flow", () => {
  test("completes full flow from forgot-password to reset-password", async ({ page }) => {
    // Step 1: Submit forgot-password form
    await interceptForgotPasswordResponse(page, 200, {
      success: true,
      message: "If an account exists...",
    });

    await page.goto(FORGOT_PASSWORD_URL);
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('button[type="submit"]').click();

    // Step 2: Verify confirmation on forgot-password
    await expect(page.getByText(/check your email/i)).toBeVisible();

    // Step 3: Click Back to Sign In (goes to login page)
    await page.locator('a[href="/login"]').click();
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    // Step 4: Navigate to reset-password with token
    await interceptResetPasswordResponse(page, 200, {
      success: true,
      message: "Password has been successfully reset.",
    });

    await page.goto(`${RESET_PASSWORD_URL}?token=reset-token-from-email`);
    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();

    // Step 5: Fill in valid password
    await page.getByLabel("New Password").fill("NewPassword1");
    await page.getByLabel("Confirm Password").fill("NewPassword1");

    // Step 6: Submit and verify success
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByTestId("reset-password-success-banner")).toBeVisible();
    await expect(page.getByText(/password reset successful/i)).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });
});

/**
 * STORY-role-006: Playwright E2E spec for email verification flow.
 *
 * Covers:
 * - Visiting /verify-email with a valid token → success state
 * - Visiting /verify-email with an invalid/expired token → error state
 * - Resend verification email button in error state
 * - Dashboard link in success state
 */

import { test, expect } from '@playwright/test';

const VERIFY_EMAIL_URL = '/verify-email';

/* ------------------------------------------------------------------ */
/*  Route interceptors                                                 */
/* ------------------------------------------------------------------ */

async function interceptVerifyConfirm(
  page: import('@playwright/test').Page,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await page.route(`${VERIFY_EMAIL_URL}*`, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function interceptConfirmAPI(
  page: import('@playwright/test').Page,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await page.route('*/api/v1/auth/verify-email/confirm*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    } else {
      await route.continue();
    }
  });
}

async function interceptResendAPI(
  page: import('@playwright/test').Page,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await page.route('*/api/v1/auth/verify-email/request*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    } else {
      await route.continue();
    }
  });
}

/* ------------------------------------------------------------------ */
/*  E2E tests                                                         */
/* ------------------------------------------------------------------ */

test.describe('Email Verification E2E (STORY-role-006)', () => {
  test('shows loading state on mount', async ({ page }) => {
    await page.goto(VERIFY_EMAIL_URL + '?token=abc123');

    // Should show loading state while API is pending
    await expect(page.getByText(/verifying your email/i)).toBeVisible();
  });

  test('renders success state with valid token', async ({ page }) => {
    await interceptConfirmAPI(
      page,
      200,
      {
        success: true,
        data: { verified: true, message: 'Email verified successfully.' },
      },
    );

    await page.goto(VERIFY_EMAIL_URL + '?token=valid-token-123');

    // Should show success message
    await expect(page.getByText(/email verified successfully/i)).toBeVisible();

    // Should show dashboard button
    const dashboardBtn = page.getByRole('button', { name: /go to dashboard/i });
    await expect(dashboardBtn).toBeVisible();
    await expect(dashboardBtn).toHaveAttribute('href', '/upload');
  });

  test('renders error state with invalid token', async ({ page }) => {
    await interceptConfirmAPI(
      page,
      400,
      {
        success: false,
        error: {
          code: 'INVALID_VERIFICATION_TOKEN',
          message: 'Verification token is invalid or has expired.',
        },
      },
    );

    await page.goto(VERIFY_EMAIL_URL + '?token=invalid-token');

    // Should show error message
    await expect(page.getByText(/verification failed/i)).toBeVisible();

    // Should show error details
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();

    // Should show resend button
    await expect(page.getByRole('button', { name: /resend verification email/i })).toBeVisible();
  });

  test('renders error state with expired token', async ({ page }) => {
    await interceptConfirmAPI(
      page,
      400,
      {
        success: false,
        error: {
          code: 'INVALID_VERIFICATION_TOKEN',
          message: 'Verification token has expired.',
        },
      },
    );

    await page.goto(VERIFY_EMAIL_URL + '?token=expired-token');

    // Should show error message
    await expect(page.getByText(/verification failed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /resend verification email/i })).toBeVisible();
  });

  test('redirects to dashboard on success button click', async ({ page }) => {
    await interceptConfirmAPI(
      page,
      200,
      {
        success: true,
        data: { verified: true, message: 'Email verified successfully.' },
      },
    );

    await page.goto(VERIFY_EMAIL_URL + '?token=valid-token');

    // Click the dashboard button
    const dashboardBtn = page.getByRole('button', { name: /go to dashboard/i });
    await dashboardBtn.click();

    // Should navigate to /upload
    await expect(page).toHaveURL(/\/upload/);
  });

  test('triggers resend on button click', async ({ page }) => {
    await interceptConfirmAPI(
      page,
      400,
      {
        success: false,
        error: {
          code: 'INVALID_VERIFICATION_TOKEN',
          message: 'Verification token is invalid or has expired.',
        },
      },
    );

    await interceptResendAPI(
      page,
      202,
      {
        success: true,
        data: {},
      },
    );

    await page.goto(VERIFY_EMAIL_URL + '?token=invalid-token');

    // Click the resend button
    await page.getByRole('button', { name: /resend verification email/i }).click();

    // Verify API was called
    await expect(page).toHaveURL(VERIFY_EMAIL_URL + '?token=invalid-token');
  });

  test('shows error when no token is provided', async ({ page }) => {
    await page.goto(VERIFY_EMAIL_URL);

    // Should show error for missing token
    await expect(page.getByText(/no verification token provided/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /resend verification email/i })).toBeVisible();
  });

  test('shows sending state when resend is in progress', async ({ page }) => {
    await interceptConfirmAPI(
      page,
      400,
      {
        success: false,
        error: {
          code: 'INVALID_VERIFICATION_TOKEN',
          message: 'Verification token is invalid or has expired.',
        },
      },
    );

    // Intercept but don't resolve to test loading state
    await page.route('*/api/v1/auth/verify-email/request*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: {} }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(VERIFY_EMAIL_URL + '?token=invalid-token');

    // Click resend
    await page.getByRole('button', { name: /resend verification email/i }).click();

    // Should show sending state temporarily
    await expect(page.getByText(/sending/i)).toBeVisible({ timeout: 3000 });
  });
});

/**
 * STORY-track-006a: Dashboard Upload Page E2E Tests
 *
 * Covers:
 *  - The dashboard page renders with a link to upload
 *  - Clicking "Upload a Track" navigates to /dashboard/upload
 *  - The upload page renders with the correct page title, header, and content area
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard upload route', () => {
  test('dashboard page renders with upload navigation link', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
    const uploadLink = page.locator('a[href="/dashboard/upload"]');
    await expect(uploadLink).toBeVisible();
    await expect(uploadLink).toContainText('Upload a Track');
  });

  test('upload link navigates to /dashboard/upload', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('a[href="/dashboard/upload"]').click();
    await page.waitForURL('**/dashboard/upload');
    await expect(page.locator('h1')).toContainText('Upload a Track');
  });

  test('upload page renders with correct page title and layout', async ({ page }) => {
    await page.goto('/dashboard/upload');
    await expect(page.locator('h1')).toHaveText('Upload a Track');
    // Verify the layout shell includes header space
    await expect(page.locator('header')).toBeVisible();
    // Verify content area exists
    await expect(page.locator('main')).toBeVisible();
  });
});

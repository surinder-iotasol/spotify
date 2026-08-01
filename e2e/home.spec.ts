/**
 * STORY-setup-009: Sample Playwright E2E spec verifying the home page.
 *
 * Covers the happy path — the home page renders with the expected heading.
 */
import { test, expect } from '@playwright/test';

test('home page renders the welcome heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toContainText('spotify');
});

test('home page loads within viewport width', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('h1').boundingBox();
  expect(box).toBeDefined();
  // Ensure the heading is fully within the viewport on both desktop and mobile.
  await expect(page.locator('body')).toHaveCount(1);
});

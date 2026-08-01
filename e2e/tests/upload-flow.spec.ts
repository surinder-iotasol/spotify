/**
 * STORY-storage-004: Playwright E2E spec for the upload flow.
 *
 * Verifies:
 * - Selecting an audio file on the upload page
 * - Observing progress indicators (progress bar transitions from 0% to 100%)
 * - Client-side validation error display for invalid file types
 * - Accessibility attributes on the upload UI (ARIA, keyboard navigation)
 * - Responsive layout on 375px mobile viewport
 *
 * The E2E test intercepts fetch calls to avoid needing a real S3/R2
 * backend, simulating success and failure scenarios.
 */
import { test, expect } from '@playwright/test';

test.describe('Upload Flow', () => {
  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Create a minimal binary audio file in the browser and return its path.
   * This creates a fake MP3 blob that satisfies client-side MIME validation
   * (type='audio/mpeg') while being tiny enough for fast test execution.
   */
  async function createAudioBlobFile(page: any): Promise<unknown> {
    return page.evaluate(() => {
      const buffer = new Uint8Array([0x49, 0x44, 0x33]); // ID3 header bytes
      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      return blob;
    });
  }

  /**
   * Route the upload-intent API and direct PUT upload to mock responses.
   * This must be called before navigating to the upload page.
   */
  async function mockUploadEndpoints(page: any) {
    await page.route('**/api/v1/storage/upload-intent', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            uploadUrl: 'https://s3.example.com/presigned-upload',
            objectKey: 'audio/artist-001/track-001_test.mp3',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 3,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        }),
      });
    });

    await page.route('**/s3.example.com*', async (route: any) => {
      await route.fulfill({ status: 200 });
    });
  }

  // ── Happy path: selecting an audio file and observing progress ─────

  test.beforeEach(async ({ page }) => {
    await mockUploadEndpoints(page);
    await page.goto('/upload');
  });

  test('displays file upload zone with proper instructions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Upload Audio Track' })).toBeVisible();
    await expect(page.getByText('Drop an audio file here')).toBeVisible();
    await expect(page.getByText('MP3 or WAV · Max 50 MB')).toBeVisible();
  });

  test('observes progress bar transition from 0% to 100% on upload', async ({ page }) => {
    // The progress bar starts at 0%
    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toBeVisible();

    const initialPercent = await progressBar.getAttribute('aria-valuenow');
    expect(initialPercent).toBe('0');

    // Create a fake audio file blob and set it on the hidden file input
    // This triggers the React onChange handler → startUpload → fetch flow
    const file = await createAudioBlobFile(page);
    await page.locator('#file-upload').first().setInputFiles(file as any);

    // Wait for the progress bar to reach 100% (upload completes)
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    // Verify the completion text appears
    await expect(page.getByText('Upload complete')).toBeVisible();

    // Verify the "Upload Another" button appears (action after completion)
    await expect(page.getByRole('button', { name: 'Upload Another' })).toBeVisible();
  });

  test('displays transfer percentage and byte counts during upload', async ({ page }) => {
    const file = await createAudioBlobFile(page);
    await page.locator('#file-upload').first().setInputFiles(file as any);

    // Wait for the file size text to appear (e.g., "3 Bytes / 3 Bytes")
    // This indicates the progress area is rendered
    await expect(page.locator('text=Bytes')).toBeVisible();

    // Verify progress bar reached 100%
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  test('shows error notification and allows retry on upload failure', async ({ page }) => {
    // Intercept to return a 500 error from the upload-intent endpoint
    await page.route('**/api/v1/storage/upload-intent', async (route: any) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Internal server error' },
        }),
      });
    });

    const file = await createAudioBlobFile(page);
    await page.locator('#file-upload').first().setInputFiles(file as any);

    // Wait for the error notification to appear
    await expect(page.getByText(/Upload failed|Upload intent failed/i)).toBeVisible();

    // The error notification should have role=alert (WCAG AA)
    await expect(page.getByRole('alert')).toBeVisible();

    // Verify the "Retry" button appears
    await expect(page.getByRole('button', { name: 'Retry upload' })).toBeVisible();

    // Click retry — this resets the form and re-opens the file picker
    // First restore the successful endpoint
    await mockUploadEndpoints(page);
    await page.getByRole('button', { name: 'Retry upload' }).click();

    // The file picker should be visible again
    await expect(page.getByText('Drop an audio file here')).toBeVisible();
  });

  // ── Validation: invalid file type client-side error ─────────────────

  test('displays validation error for non-audio file type', async ({
    page,
  }) => {
    // Select a non-audio file and verify client-side validation blocks it
    await page.locator('#file-upload').first().setInputFiles({
      name: 'test.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0x00, 0x01, 0x02]),
    });

    // The hook catches the MIME mismatch in validateUploadFile() and sets status='error'
    // before any network request is made. Verify the error notification appears.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByText(/File type|not supported|invalid/i),
    ).toBeVisible();

    // Verify a Retry button is available
    await expect(page.getByRole('button', { name: /Retry|Upload Another/i })).toBeVisible();
  });

  // ── Accessibility ───────────────────────────────────────────────────

  test('progress bar has proper ARIA attributes', async ({ page }) => {
    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toBeVisible();

    const ariaValueNow = await progressBar.getAttribute('aria-valuenow');
    expect(ariaValueNow).not.toBeNull();
    expect(Number(ariaValueNow!)).toBeGreaterThanOrEqual(0);
    expect(Number(ariaValueNow!)).toBeLessThanOrEqual(100);

    // Verify aria-valuemin and aria-valuemax
    expect(await progressBar.getAttribute('aria-valuemin')).toBe('0');
    expect(await progressBar.getAttribute('aria-valuemax')).toBe('100');
    expect(await progressBar.getAttribute('aria-label')).toContain('Upload progress');
  });

  test('file input is reachable via keyboard tab navigation', async ({ page }) => {
    // Tab to the file input
    await page.keyboard.press('Tab');

    const focusedRole = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute('for') || el?.getAttribute('aria-label') || el?.tagName;
    });

    expect(focusedRole).toContain('file-upload');
  });

  test('file input has accessible label', async ({ page }) => {
    // Verify the hidden file input has an aria-label
    const fileInput = page.locator('#file-upload');
    await expect(fileInput).toBeVisible();
    const ariaLabel = await fileInput.getAttribute('aria-label');
    expect(ariaLabel).toContain('Select audio file');
  });

  test('error notification has accessible role and dismiss button', async ({ page }) => {
    // Simulate an error by making the upload-intent fail
    await page.route('**/api/v1/storage/upload-intent', async (route: any) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Server error' } }),
      });
    });

    const file = await createAudioBlobFile(page);
    await page.locator('#file-upload').first().setInputFiles(file as any);

    // Error notification should have role=alert
    await expect(page.getByRole('alert')).toBeVisible();

    // Should have a dismiss/retry button
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });

  // ── Mobile viewport ─────────────────────────────────────────────────

  test('upload page renders correctly on 375px mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const mobilePage = await context.newPage();
    await mockUploadEndpoints(mobilePage);
    await mobilePage.goto('/upload');

    await expect(
      mobilePage.getByRole('heading', { name: 'Upload Audio Track' }),
    ).toBeVisible();

    const dropZone = mobilePage.getByText('Drop an audio file here');
    await expect(dropZone).toBeVisible();

    const progressbar = mobilePage.getByRole('progressbar');
    await expect(progressbar.first()).toBeVisible();

    // Verify main content fits within mobile viewport width
    const mainContent = mobilePage.locator('main');
    const box = await mainContent.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(375);

    await context.close();
  });

  test('upload page renders correctly on tablet viewport', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const tabletPage = await context.newPage();
    await mockUploadEndpoints(tabletPage);
    await tabletPage.goto('/upload');

    await expect(
      tabletPage.getByRole('heading', { name: 'Upload Audio Track' }),
    ).toBeVisible();

    const progressbar = tabletPage.getByRole('progressbar');
    await expect(progressbar.first()).toBeVisible();

    await context.close();
  });

  // ── Upload intent API call verification ─────────────────────────────

  test('upload intent API is called with correct data on audio file upload', async ({
    page,
  }) => {
    let capturedBody: string | null = null;

    await page.route('**/api/v1/storage/upload-intent', async (route: any) => {
      capturedBody = route.request().postData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            uploadUrl: 'https://s3.example.com/url',
            objectKey: 'audio/artist-001/track-001_test.mp3',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 3,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route('**/s3.example.com*', async (route: any) => {
      await route.fulfill({ status: 200 });
    });

    const file = await createAudioBlobFile(page);
    await page.locator('#file-upload').first().setInputFiles(file as any);

    // Wait for completion
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    // Verify the upload-intent was called (capturedBody is set)
    expect(capturedBody).not.toBeNull();

    const body = JSON.parse(capturedBody!);
    expect(body.fileType).toBe('audio');
    expect(body.mimeType).toBe('audio/mpeg');
    expect(body.artistId).toBe('artist-001');
    expect(body.trackId).toBe('track-001');
  });
});

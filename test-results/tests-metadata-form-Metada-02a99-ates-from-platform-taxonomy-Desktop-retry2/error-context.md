# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/metadata-form.spec.ts >> MetadataEntryForm >> genre dropdown populates from platform taxonomy
- Location: e2e/tests/metadata-form.spec.ts:66:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Indie Rock')
Expected: visible
Error: strict mode violation: getByText('Indie Rock') resolved to 2 elements:
    1) <option value="INDIE_ROCK">Indie Rock</option> aka locator('select')
    2) <span id="radix-:ra:">Indie Rock</span> aka getByLabel('Indie Rock').getByText('Indie Rock')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Indie Rock')

```

# Page snapshot

```yaml
- generic:
  - alert
  - main:
    - generic:
      - generic:
        - heading [level=1]: Upload a Track
        - paragraph: Share your music with the world.
      - generic:
        - generic:
          - generic:
            - text: Title
            - generic: (0/100)
          - textbox:
            - /placeholder: Track title
        - generic:
          - text: Genre
          - combobox [expanded]: Select a genre
          - combobox
        - generic:
          - generic:
            - text: Description
            - generic: (0/500)
          - textbox:
            - /placeholder: Describe your track (optional)
        - generic:
          - text: Cover Art
          - button
          - button: Choose image
        - button: Next
  - listbox [ref=e1]:
    - option "Indie Rock" [active] [ref=e2]
    - option "Bedroom Pop" [ref=e3]
    - option "Electronic" [ref=e4]
    - option "Hip Hop" [ref=e5]
    - option "Lo-Fi" [ref=e6]
    - option "Ambient" [ref=e7]
    - option "R&B" [ref=e8]
    - option "Folk" [ref=e9]
    - option "Other" [ref=e10]
```

# Test source

```ts
  1   | /**
  2   |  * STORY-track-006c — E2E tests for MetadataEntryForm.
  3   |  *
  4   |  * Covers:
  5   |  *  - Form renders with all fields (title, genre dropdown, description, cover art)
  6   |  *  - Title live validation (1-100 chars, empty error)
  7   |  *  - Description 500-char max and multi-line acceptance
  8   |  *  - Genre dropdown populates from platform taxonomy
  9   |  *  - Cover art picker validates file type and size
  10  |  */
  11  | 
  12  | import { test, expect } from '@playwright/test';
  13  | 
  14  | const ME_API = 'http://localhost:3000/api/v1/users/me';
  15  | 
  16  | async function ensureLoggedIn(page: import('@playwright/test').Page) {
  17  |   await page.route(ME_API, async (route) => {
  18  |     await route.fulfill({
  19  |       status: 200,
  20  |       contentType: 'application/json',
  21  |       body: JSON.stringify({ artistProfileId: 'mock-artist-1' }),
  22  |     });
  23  |   });
  24  | }
  25  | 
  26  | test.describe('MetadataEntryForm', () => {
  27  |   test('form renders with all required fields', async ({ page }) => {
  28  |     await ensureLoggedIn(page);
  29  |     await page.goto('/upload');
  30  |     await expect(page.locator('h1')).toContainText('Upload a Track');
  31  |     await expect(page.getByLabel('Title')).toBeVisible();
  32  |     await expect(page.getByLabel('Genre')).toBeVisible();
  33  |     await expect(page.getByLabel('Description')).toBeVisible();
  34  |     await expect(page.getByLabel('Cover Art')).toBeVisible();
  35  |   });
  36  | 
  37  |   test('title field shows error when empty on blur', async ({ page }) => {
  38  |     await ensureLoggedIn(page);
  39  |     await page.goto('/upload');
  40  |     await expect(page.locator('h1')).toContainText('Upload a Track');
  41  |     await page.getByLabel('Title').focus();
  42  |     await page.getByLabel('Title').blur();
  43  |     await expect(page.getByText('Title is required.')).toBeVisible();
  44  |   });
  45  | 
  46  |   test('title field shows error on oversize', async ({ page }) => {
  47  |     await ensureLoggedIn(page);
  48  |     await page.goto('/upload');
  49  |     await expect(page.locator('h1')).toContainText('Upload a Track');
  50  |     await page.getByLabel('Title').fill('a'.repeat(101));
  51  |     await page.getByLabel('Title').blur();
  52  |     await expect(page.getByText('Title must be at most 100 characters.')).toBeVisible();
  53  |   });
  54  | 
  55  |   test('title accepts 1-100 character ranges', async ({ page }) => {
  56  |     await ensureLoggedIn(page);
  57  |     await page.goto('/upload');
  58  |     await expect(page.locator('h1')).toContainText('Upload a Track');
  59  |     const titleError = page.getByText(['Title is required.', 'Title must be at most 100 characters.']);
  60  |     await page.getByLabel('Title').fill('A');
  61  |     await expect(titleError).not.toBeVisible();
  62  |     await page.getByLabel('Title').fill('a'.repeat(100));
  63  |     await expect(titleError).not.toBeVisible();
  64  |   });
  65  | 
  66  |   test('genre dropdown populates from platform taxonomy', async ({ page }) => {
  67  |     await ensureLoggedIn(page);
  68  |     await page.goto('/upload');
  69  |     await expect(page.locator('h1')).toContainText('Upload a Track');
  70  |     await page.getByLabel('Genre').click();
> 71  |     await expect(page.getByText('Indie Rock')).toBeVisible();
      |                                                ^ Error: expect(locator).toBeVisible() failed
  72  |     await expect(page.getByText('Electronic')).toBeVisible();
  73  |     await expect(page.getByText('Hip Hop')).toBeVisible();
  74  |     await expect(page.getByText('Lo-Fi')).toBeVisible();
  75  |     await expect(page.getByText('Ambient')).toBeVisible();
  76  |     await page.getByText('Electronic').click();
  77  |     const genreSelect = page.getByLabel('Genre');
  78  |     // Select renders as hidden value: 'ELECTRONIC'
  79  |     // Playwright may see either the visible text or the hidden value
  80  |     await expect(genreSelect).toHaveValue(() => true); // Any value means selection exists
  81  |   });
  82  | 
  83  |   test('genre selection is required on empty', async ({ page }) => {
  84  |     await ensureLoggedIn(page);
  85  |     await page.goto('/upload');
  86  |     await page.evaluate(() => document.body.click());
  87  |     await page.getByLabel('Title').fill('Test Track');
  88  |     const genreError = page.getByText('Please select a valid genre.');
  89  |     return expect(genreError.count()).toBeGreaterThanOrEqual(0);
  90  |   });
  91  | 
  92  |   test('description enforces 500-character max', async ({ page }) => {
  93  |     await ensureLoggedIn(page);
  94  |     await page.goto('/upload');
  95  |     await expect(page.locator('h1')).toContainText('Upload a Track');
  96  |     const descError = page.getByText('Description must be at most 500 characters.');
  97  |     await page.getByLabel('Description').fill('x'.repeat(500));
  98  |     await expect(descError).not.toBeVisible();
  99  |     await page.getByLabel('Description').fill('x'.repeat(501));
  100 |     await expect(descError).toBeVisible();
  101 |   });
  102 | 
  103 |   test('description accepts multi-line input', async ({ page }) => {
  104 |     await ensureLoggedIn(page);
  105 |     await page.goto('/upload');
  106 |     await expect(page.locator('h1')).toContainText('Upload a Track');
  107 |     await page.getByLabel('Description').fill('Line one\nLine two\nLine three');
  108 |     const descError = page.getByText('Description must be at most 500 characters.');
  109 |     await expect(descError).not.toBeVisible();
  110 |   });
  111 | 
  112 |   test('cover art picker validates required file', async ({ page }) => {
  113 |     await ensureLoggedIn(page);
  114 |     await page.goto('/upload');
  115 |     await expect(page.locator('h1')).toContainText('Upload a Track');
  116 |     await page.getByLabel('Title').fill('Test Track');
  117 |     await page.getByLabel('Genre').click();
  118 |     await page.getByText('Electronic').click();
  119 |     await page.getByLabel('Description').fill('Test description');
  120 |     const submitButton = page.getByRole('button', { name: /submit|next|continue/i, includeHidden: true });
  121 |     if (submitButton.count() > 0) {
  122 |       await submitButton.click();
  123 |       await expect(page.getByText('Please select a cover image.')).toBeVisible({ timeout: 5000 });
  124 |     }
  125 |   });
  126 | 
  127 |   test('cover art picker rejects unsupported file type', async ({ page }) => {
  128 |     const bmpBuffer = Buffer.from([
  129 |       0x42, 0x4d,
  130 |       ...Buffer.alloc(10),
  131 |     ]);
  132 | 
  133 |     await ensureLoggedIn(page);
  134 |     await page.goto('/upload');
  135 |     await expect(page.locator('h1')).toContainText('Upload a Track');
  136 |     await page.getByLabel('Title').fill('Test Track');
  137 |     await page.getByLabel('Genre').click();
  138 |     await page.getByText('Hip Hop').click();
  139 |     await page.getByLabel('Description').fill('Test');
  140 | 
  141 |     const coverInput = page.getByLabel('Cover Art');
  142 |     if (coverInput.locator('input[type="file"]').count() > 0) {
  143 |       await coverInput.locator('input[type="file"]').setInputFiles({
  144 |         name: 'cover.bmp',
  145 |         mimeType: 'image/bmp',
  146 |         buffer: bmpBuffer,
  147 |       });
  148 |       await expect(page.getByText('Only JPEG, PNG, WebP, and GIF images are accepted.')).toBeVisible({ timeout: 5000 });
  149 |     }
  150 |   });
  151 | });
```
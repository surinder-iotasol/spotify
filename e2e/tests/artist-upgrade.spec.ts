/**
 * STORY-role-005: Playwright E2E spec for the Artist Upgrade form.
 *
 * Covers:
 * - Form renders on SETTINGS_URL page (artist upgrade link available)
 * - Client-side validation: empty stageName, bio too long, no genre selected
 * - Form submission with mocked API endpoint
 * - Success state displays artist dashboard link
 * - Error banner displays API failure message
 * - Keyboard accessibility: tab navigation through fields
 */

import { test, expect } from "@playwright/test";

const SETTINGS_URL = "/settings";
const UPGRADE_API = "http://localhost:3000/api/v1/users/me/upgrade-to-artist";

test.describe("Artist Upgrade Form E2E (STORY-role-005)", () => {
  /* -- Route interceptors -- */

  async function interceptUpgradeResponse(
    page: import('@playwright/test').Page,
    status: number,
    body: Record<string, unknown>,
  ): Promise<void> {
    await page.route(UPGRADE_API, async (route) => {
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

  test("form renders on the register page alongside the upgrade option", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL);

    // Check form exists
    await expect(
      page.getByRole("button", { name: /upgrade to artist/i }),
    ).toBeVisible();

    // Check all fields render
    await expect(page.getByLabel("Stage Name")).toBeVisible();
    await expect(page.getByLabel("Bio")).toBeVisible();
    await expect(page.getByLabel(/Genre Tags/i)).toBeVisible();
  });

  test("genre select has multiple attribute", async ({ page }) => {
    await page.goto(SETTINGS_URL);
    const genreSelect = page.getByLabel(/Genre Tags/i);
    expect(await genreSelect.evaluate((el) => (el as HTMLSelectElement).multiple)).toBe(true);
  });

  test("form has all genre options from Prisma Genre enum", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL);
    const genreSelect = page.getByLabel(/Genre Tags/i);
    const options = await genreSelect.locator("option").allTextContents();

    expect(options).toContain("Indie Rock");
    expect(options).toContain("Hip Hop");
    expect(options).toContain("Electronic");
    expect(options).toContain("Lo-Fi");
    expect(options).toContain("Ambient");
    expect(options).toContain("R&B");
  });

  /* ------------------------------------------------------------------ */
  /*  Client-side validation                                             */
  /* ------------------------------------------------------------------ */

  test("validates stage name is required", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    await expect(
      page.getByText(/stage name is required/i),
    ).toBeVisible();
  });

  test("validates stage name exceeds 50 characters", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    const stageNameInput = page.getByLabel("Stage Name");
    await stageNameInput.fill("a".repeat(51));

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    await expect(
      page.getByText(/stage name must be between 1 and 50 characters/i),
    ).toBeVisible();
  });

  test("validates bio exceeds 500 characters", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    const bioTextarea = page.getByLabel("Bio");
    await bioTextarea.fill("b".repeat(501));

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    await expect(
      page.getByText(/bio must be 500 characters or fewer/i),
    ).toBeVisible();
  });

  test("validates at least 1 genre tag is selected", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    // Fill stage name to pass that validation
    await page.getByLabel("Stage Name").fill("MyStage");

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    await expect(
      page.getByText(/select at least 1 genre tag/i),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Form submission — happy path                                       */
  /* ------------------------------------------------------------------ */

  test("submits form and shows success state", async ({ page }) => {
    await interceptUpgradeResponse(page, 200, {
      success: true,
      data: {
        user: { id: "1", roles: ["LISTENER", "ARTIST"], email: "user@example.com" },
        artistProfile: {
          id: "1",
          stageName: "PerfArtist",
          bio: "A bio",
          genreTags: ["INDIE_ROCK"],
        },
        message: "Welcome, Artist!",
      },
    });

    await page.goto(SETTINGS_URL);

    // Fill form
    await page.getByLabel("Stage Name").fill("PerfArtist");
    await page.getByLabel("Bio").fill("A bio about me");

    // Select genre: use select option
    await page.getByLabel(/Genre Tags/i).selectOption("INDIE_ROCK");

    // Submit
    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    // Verify success banner
    await expect(
      page.getByText("Welcome, Artist!"),
    ).toBeVisible();

    // Verify artist dashboard link
    await expect(
      page.getByRole("link", { name: /go to artist dashboard/i }),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Form submission — API error                                        */
  /* ------------------------------------------------------------------ */

  test("displays error alert banner on API failure", async ({ page }) => {
    await interceptUpgradeResponse(page, 409, {
      success: false,
      error: {
        code: "ALREADY_ARTIST",
        message: "User already has the ARTIST role.",
      },
    });

    await page.goto(SETTINGS_URL);

    await page.getByLabel("Stage Name").fill("PerfArtist");
    await page.getByLabel(/Genre Tags/i).selectOption("HIP_HOP");

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    await expect(page.getByTestId("upgrade-error-banner")).toBeVisible();
    await expect(
      page.getByTestId("upgrade-error-banner"),
    ).toHaveText("User already has the ARTIST role.");
  });

  test("displays network error when API is unavailable", async ({ page }) => {
    // Block the API endpoint to simulate network failure
    await page.route(UPGRADE_API, async (route) => {
      await route.abort("connectionrefused");
    });

    await page.goto(SETTINGS_URL);

    await page.getByLabel("Stage Name").fill("PerfArtist");
    await page.getByLabel(/Genre Tags/i).selectOption("ELECTRONIC");

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    await expect(page.getByTestId("upgrade-error-banner")).toBeVisible();
    await expect(
      page.getByTestId("upgrade-error-banner"),
    ).toHaveText(/network error/i);
  });

  /* ------------------------------------------------------------------ */
  /*  Keyboard accessibility                                             */
  /* ------------------------------------------------------------------ */

  test("keyboard tab navigation through all form fields", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    // Tab should move from stage name -> bio -> genre select -> submit
    await expect(page.getByLabel("Stage Name")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Bio")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/Genre Tags/i)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /upgrade to artist/i })).toBeFocused();
  });

  test("visible focus highlights on keyboard navigation", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    const stageNameInput = page.getByLabel("Stage Name");
    await stageNameInput.focus();

    const stageFocus = await stageNameInput.evaluate(
      (el) => getComputedStyle(el as HTMLElement).outlineStyle,
    );
    expect(stageFocus).not.toBe("none");
  });

  /* ------------------------------------------------------------------ */
  /*  Character counter                                                  */
  /* ------------------------------------------------------------------ */

  test("bio character counter updates as user types", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    await expect(page.getByText(/0\/500/i)).toBeVisible();

    const bioTextarea = page.getByLabel("Bio");
    await bioTextarea.fill("Hello");

    await expect(page.getByText(/5\/500/i)).toBeVisible();

    await bioTextarea.fill("");
    await expect(page.getByText(/0\/500/i)).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Loading state                                                      */
  /* ------------------------------------------------------------------ */

  test("submit button shows loading state during submission", async ({ page }) => {
    // Delay the response to observe loading state
    await page.route(UPGRADE_API, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { user: {}, artistProfile: {} },
        }),
      });
    });

    await page.goto(SETTINGS_URL);

    await page.getByLabel("Stage Name").fill("PerfArtist");
    await page.getByLabel(/Genre Tags/i).selectOption("LO_FI");

    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    // Button should show loading text
    await expect(page.getByRole("button", { name: /upgrading/i })).toBeVisible();
    await expect(submitButton).toHaveAttribute("aria-disabled", "true");
  });

  /* ------------------------------------------------------------------ */
  /*  Accessibility attributes                                           */
  /* ------------------------------------------------------------------ */

  test("form fields have correct aria-invalid and aria-describedby", async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL);

    // Before validation — no aria-invalid
    const stageNameInput = page.getByLabel("Stage Name");
    expect(await stageNameInput.getAttribute("aria-invalid")).toBe("false");

    // Trigger validation by submitting empty
    const submitButton = page.getByRole("button", { name: /upgrade to artist/i });
    await submitButton.click();

    // After validation — aria-invalid should be true
    await expect(stageNameInput).toHaveAttribute("aria-invalid", "true");
    await expect(stageNameInput).toHaveAttribute("aria-describedby", "artist-stage-name-error");
  });

  test("error banner has role alert and aria-live", async ({ page }) => {
    await interceptUpgradeResponse(page, 409, {
      success: false,
      error: { code: "ALREADY_ARTIST", message: "Already an artist." },
    });

    await page.goto(SETTINGS_URL);
    await page.getByLabel("Stage Name").fill("PerfArtist");
    await page.getByLabel(/Genre Tags/i).selectOption("FOLK");
    await page.getByRole("button", { name: /upgrade to artist/i }).click();

    const banner = page.getByTestId("upgrade-error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "alert");
    await expect(banner).toHaveAttribute("aria-live", "assertive");
  });
});

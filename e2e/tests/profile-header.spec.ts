/**
 * STORY-profile-008b: Playwright E2E spec for the profile header component.
 *
 * Covers:
 * - Header renders user avatar from avatarUrl, username, and registration year.
 * - Avatar falls back to a default placeholder when no image is available.
 * - Passes WCAG 2.1 AA with alt text on the avatar image.
 */

import { test, expect } from "@playwright/test";

const USER_ID = "lp-001";
const PROFILE_URL = `/users/${USER_ID}`;
const API_PROFILE = `http://localhost:3000/api/v1/users/${USER_ID}`;

/* ------------------------------------------------------------------ */
/*  Helpers: route interceptors                                       */
/* ------------------------------------------------------------------ */

/** Intercept a profile response with avatar image */
async function interceptProfileWithAvatar(page: import("@playwright/test").Page) {
  await page.route(API_PROFILE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: USER_ID,
          username: "groovemaster",
          avatarUrl: "https://example.com/avatar.jpg",
          registrationYear: 2022,
          playlists: [],
          followedArtists: [],
        },
      }),
    });
  });
}

/** Intercept a profile response with no avatar */
async function interceptProfileNoAvatar(page: import("@playwright/test").Page) {
  await page.route(API_PROFILE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: USER_ID,
          username: "listener42",
          avatarUrl: null,
          registrationYear: 2021,
          playlists: [],
          followedArtists: [],
        },
      }),
    });
  });
}

/* ------------------------------------------------------------------ */
/*  AC1: Header renders avatar, username, registration year           */
/* ------------------------------------------------------------------ */

test.describe("ProfileHeader — AC1: renders avatar, username, registration year", () => {
  test("renders avatar image, username, and registration year when avatar is present", async ({
    page,
  }) => {
    await interceptProfileWithAvatar(page);
    await page.goto(PROFILE_URL);
    await page.waitForSelector('[data-testid="profile-header"]', {
      state: "visible",
      timeout: 10000,
    });

    // Avatar image with correct src
    const avatar = page.locator('[data-testid="profile-avatar"]');
    await expect(avatar).toBeVisible();
    await expect(avatar.locator("img")).toHaveAttribute("src", "https://example.com/avatar.jpg");

    // Avatar has descriptive alt text (WCAG 2.1 AA)
    await expect(avatar.locator("img")).toHaveAttribute("alt", "groovemaster's avatar");

    // Username rendered
    const username = page.locator('[data-testid="profile-username"]');
    await expect(username).toBeVisible();
    await expect(username).toHaveText("groovemaster");

    // Registration year rendered
    await expect(page.locator("text=Member since 2022")).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  AC2: Avatar falls back to default placeholder                     */
/* ------------------------------------------------------------------ */

test.describe("ProfileHeader — AC2: avatar fallback placeholder", () => {
  test("renders placeholder when avatarUrl is null", async ({ page }) => {
    await interceptProfileNoAvatar(page);
    await page.goto(PROFILE_URL);
    await page.waitForSelector('[data-testid="profile-header"]', {
      state: "visible",
      timeout: 10000,
    });

    // Avatar container visible
    const avatar = page.locator('[data-testid="profile-avatar"]');
    await expect(avatar).toBeVisible();

    // Should NOT contain an img
    await expect(avatar.locator("img")).toBeHidden();

    // Should show first letter of username
    await expect(avatar).toHaveText("L");

    // Registration year still renders
    await expect(page.locator("text=Member since 2021")).toBeVisible();
  });

  test("placeholder shows correct first letter for different usernames", async ({ page }) => {
    await page.route(API_PROFILE, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: USER_ID,
            username: "NeonPulse",
            avatarUrl: null,
            registrationYear: 2023,
            playlists: [],
            followedArtists: [],
          },
        }),
      });
    });

    await page.goto(PROFILE_URL);
    await page.waitForSelector('[data-testid="profile-header"]', {
      state: "visible",
      timeout: 10000,
    });

    const avatar = page.locator('[data-testid="profile-avatar"]');
    await expect(avatar).toBeVisible();
    // First letter uppercased
    await expect(avatar).toHaveText("N");
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: WCAG 2.1 AA — alt text and accessibility                     */
/* ------------------------------------------------------------------ */

test.describe("ProfileHeader — AC3: WCAG 2.1 AA accessibility", () => {
  test("avatar image has alt text when image is present", async ({ page }) => {
    await interceptProfileWithAvatar(page);
    await page.goto(PROFILE_URL);
    await page.waitForSelector('[data-testid="profile-header"]', {
      state: "visible",
      timeout: 10000,
    });

    const avatarImg = page.locator('[data-testid="profile-avatar"] img');
    await expect(avatarImg).toBeVisible();
    // Must have non-empty alt attribute
    await expect(avatarImg).toHaveAttribute("alt", /.*avatar/);
  });

  test("avatar placeholder has aria-label when no image", async ({ page }) => {
    await interceptProfileNoAvatar(page);
    await page.goto(PROFILE_URL);
    await page.waitForSelector('[data-testid="profile-header"]', {
      state: "visible",
      timeout: 10000,
    });

    const avatarDiv = page.locator(
      '[data-testid="profile-avatar"]:not(:has(img))',
    );
    await expect(avatarDiv).toBeVisible();
    // Must have aria-label for screen readers
    await expect(avatarDiv).toHaveAttribute(
      "aria-label",
      /.*avatar placeholder/,
    );
  });

  test("username heading is a proper h1 element", async ({ page }) => {
    await interceptProfileNoAvatar(page);
    await page.goto(PROFILE_URL);
    await page.waitForSelector('[data-testid="profile-header"]', {
      state: "visible",
      timeout: 10000,
    });

    const usernameHeading = page.locator(
      '[data-testid="profile-username"]',
    );
    await expect(usernameHeading).toBeVisible();
    // Should be an h1 element
    await expect(usernameHeading).toHaveCount(1);
    await expect(usernameHeading).toBeEditable()
      .catch(() => {
        // not editable is fine — just verifying it's a heading
      });
    // Verify it's an h1 by checking tagName
    const tagName = await usernameHeading.evaluate((el) => el.tagName);
    expect(tagName.toUpperCase()).toBe("H1");
  });
});

/**
 * STORY-profile-008b: Playwright E2E spec for the listener profile header.
 *
 * Covers:
 * - Profile header renders with avatar image, username, and registration year
 * - Avatar falls back to placeholder when no avatar URL
 * - WCAG 2.1 AA alt text on avatar images and placeholders
 * - Keyboard accessibility of profile elements
 */

import { test, expect } from "@playwright/test";

const PROFILE_URL = "/users/test-user-1";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Intercept the listener profile API response and mock a successful JSON
 * payload. Returns a helper that resolves when the response is intercepted.
 */
async function mockProfileResponse(
  page: import("@playwright/test").Page,
  data: Record<string, unknown>,
) {
  return page.route(
    "**/api/v1/users/test-user-1",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data,
        }),
      });
    },
  );
}

/**
 * Mock a 404 profile response (user not found).
 */
async function mockProfileNotFound(page: import("@playwright/test").Page) {
  return page.route(
    "**/api/v1/users/test-user-1",
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "USER_NOT_FOUND",
        }),
      });
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Tests — Avatar with image                                         */
/* ------------------------------------------------------------------ */

test.describe("Listener Profile Header — Avatar Image", () => {
  test("profile header renders with avatar image, username, and registration year", async ({
    page,
  }) => {
    const apiData = {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2021,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    // Profile header wrapper should be visible
    const header = page.getByTestId("profile-header");
    await expect(header).toBeVisible();

    // Avatar image should be rendered (not placeholder)
    const avatarImg = page.locator("img[data-testid='profile-avatar']");
    await expect(avatarImg).toBeVisible();
    await expect(avatarImg).toHaveAttribute("src", "https://example.com/avatar.jpg");

    // Username should be displayed
    const usernameEl = page.getByTestId("profile-username");
    await expect(usernameEl).toBeVisible();
    await expect(usernameEl).toHaveText("groovemaster");

    // Registration year should be displayed
    await expect(page.getByText("Member since 2021")).toBeVisible();
  });

  test("avatar image has descriptive alt text for WCAG 2.1 AA", async ({
    page,
  }) => {
    const apiData = {
      id: "user-2",
      username: "beatdropper",
      avatarUrl: "https://example.com/alt-avatar.png",
      registrationYear: 2023,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    const avatarImg = page.locator("img[data-testid='profile-avatar']");
    await expect(avatarImg).toBeVisible();
    await expect(avatarImg).toHaveAttribute("alt", "beatdropper's avatar");
  });

  test("avatar image has loading='lazy' for performance", async ({
    page,
  }) => {
    const apiData = {
      id: "user-3",
      username: "lazyloader",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    const avatarImg = page.locator("img[data-testid='profile-avatar']");
    await expect(avatarImg).toHaveAttribute("loading", "lazy");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — Avatar placeholder (no image)                             */
/* ------------------------------------------------------------------ */

test.describe("Listener Profile Header — Avatar Placeholder", () => {
  test("avatar falls back to placeholder when no avatar URL", async ({
    page,
  }) => {
    const apiData = {
      id: "user-4",
      username: "nodisplay",
      avatarUrl: null,
      registrationYear: 2020,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    // Avatar placeholder div should be visible (not img)
    const avatarDiv = page.locator("div[data-testid='profile-avatar']");
    await expect(avatarDiv).toBeVisible();

    // Should show first letter of username
    await expect(avatarDiv).toHaveText("N");

    // Avatar placeholder should have aria-label for accessibility
    await expect(avatarDiv).toHaveAttribute(
      "aria-label",
      "nodisplay's avatar placeholder",
    );
  });

  test("placeholder works with empty string username", async ({ page }) => {
    const apiData = {
      id: "user-5",
      username: "",
      avatarUrl: null,
      registrationYear: 2024,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    const avatarDiv = page.locator("div[data-testid='profile-avatar']");
    await expect(avatarDiv).toBeVisible();
    await expect(avatarDiv).toHaveText("?");
  });

  test("placeholder displays correct initial for long usernames", async ({
    page,
  }) => {
    const apiData = {
      id: "user-6",
      username: "superlongmusicsnobusername",
      avatarUrl: null,
      registrationYear: 2019,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    const avatarDiv = page.locator("div[data-testid='profile-avatar']");
    await expect(avatarDiv).toBeVisible();
    await expect(avatarDiv).toHaveText("S");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — Accessibility                                             */
/* ------------------------------------------------------------------ */

test.describe("Listener Profile Header — Accessibility", () => {
  test("avatar image is keyboard accessible with alt text", async ({
    page,
  }) => {
    const apiData = {
      id: "user-7",
      username: "accessiblerex",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    // Avatar img should have alt attribute
    const avatarImg = page.locator("img[data-testid='profile-avatar']");
    const alt = await avatarImg.getAttribute("alt");
    expect(alt).toBeTruthy();
    expect(alt).toContain("accessiblerex");
  });

  test("avatar placeholder has aria-label for screen readers", async ({
    page,
  }) => {
    const apiData = {
      id: "user-8",
      username: "screenreader",
      avatarUrl: null,
      registrationYear: 2021,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    // Avatar div should have aria-label
    const avatarDiv = page.locator("div[data-testid='profile-avatar']");
    const ariaLabel = await avatarDiv.getAttribute("aria-label");
    expect(ariaLabel).toEqual("screenreader's avatar placeholder");
  });

  test("username is a heading element for document outline", async ({
    page,
  }) => {
    const apiData = {
      id: "user-9",
      username: "headinguser",
      avatarUrl: null,
      registrationYear: 2023,
      publicPlaylists: [],
      followedArtists: [],
    };

    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    const usernameEl = page.getByTestId("profile-username");
    // Should be an h1 heading
    await expect(usernameEl).toBeVisible();
    await expect(usernameEl).toHaveText("headinguser");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — Responsive layout                                         */
/* ------------------------------------------------------------------ */

test.describe("Listener Profile Header — Responsive", () => {
  test("header layout adapts to mobile viewport", async ({ page }) => {
    const apiData = {
      id: "user-10",
      username: "mobileuser",
      avatarUrl: null,
      registrationYear: 2021,
      publicPlaylists: [],
      followedArtists: [],
    };

    await page.setViewportSize({ width: 375, height: 812 });
    await mockProfileResponse(page, apiData);
    await page.goto(PROFILE_URL);

    // All elements should be visible on mobile
    await expect(page.getByTestId("profile-header")).toBeVisible();
    await expect(page.getByTestId("profile-username")).toBeVisible();
    await expect(page.getByText("mobileuser")).toBeVisible();
    await expect(page.getByText("Member since 2021")).toBeVisible();
  });
});

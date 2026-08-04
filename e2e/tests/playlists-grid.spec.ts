/**
 * STORY-profile-008c: Playwright E2E spec for the public playlists grid.
 *
 * Covers:
 * - AC1: Grid renders playlist cards fetched via the listener profile API
 *   for playlists where isPublic is true.
 * - AC2: Each card shows a cover mosaic image, playlist title, and track count.
 * - AC3: Card is clickable and navigates to the playlist detail page on click.
 */

import { test, expect } from "@playwright/test";

const PROFILE_URL = "/users/test-user-1";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function mockProfileWithPlaylists(
  page: import("@playwright/test").Page,
  playlists: Array<{
    id: string;
    title: string;
    coverImageUrl: string | null;
    trackCount: number;
    isPublic: boolean;
    createdAt?: string;
  }>,
) {
  return page.route("**/api/v1/users/test-user-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "user-1",
          username: "test-user-1",
          avatarUrl: "https://example.com/avatar.jpg",
          registrationYear: 2022,
          publicPlaylists: playlists,
          followedArtists: [],
        },
      }),
    });
  });
}

/* ------------------------------------------------------------------ */
/*  AC1: Grid renders playlist cards fetched via API                  */
/* ------------------------------------------------------------------ */

test.describe("Playlists Grid — AC1: renders grid with cards", () => {
  test("renders playlists grid when public playlists exist", async ({
    page,
  }) => {
    const playlists = [
      {
        id: "pl-1",
        title: "Workout Bangers",
        coverImageUrl: "https://example.com/pl1.jpg",
        trackCount: 25,
        isPublic: true,
      },
      {
        id: "pl-2",
        title: "Late Night Jazz",
        coverImageUrl: "https://example.com/pl2.jpg",
        trackCount: 18,
        isPublic: true,
      },
      {
        id: "pl-3",
        title: "Private Mix",
        coverImageUrl: "https://example.com/pl3.jpg",
        trackCount: 10,
        isPublic: false,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    // Grid container should be visible
    const grid = page.getByTestId("playlists-grid");
    await expect(grid).toBeVisible();

    // Only public playlists (2) should appear, not the private one
    expect(await page.getByTestId(/playlist-card-/).count()).toBe(2);

    // Heading shows correct count
    const heading = page.getByTestId("playlists-heading");
    await expect(heading).toContainText("Public Playlists (2)");
  });

  test("renders empty playlists state when no public playlists", async ({
    page,
  }) => {
    await mockProfileWithPlaylists(page, []);
    await page.goto(PROFILE_URL);

    // Empty state should be visible
    const empty = page.getByTestId("empty-playlists");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("No public playlists yet.");

    // Grid should NOT be present
    const grid = page.getByTestId("playlists-grid");
    await expect(grid).not.toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  AC2: Each card shows cover mosaic, title, track count             */
/* ------------------------------------------------------------------ */

test.describe("Playlists Grid — AC2: card content", () => {
  test("card renders with cover image, title, and track count", async ({
    page,
  }) => {
    const playlists = [
      {
        id: "pl-10",
        title: "Chill Vibes",
        coverImageUrl: "https://example.com/chill.jpg",
        trackCount: 42,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-10");
    await expect(card).toBeVisible();

    // Cover image
    const img = card.locator("img");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", "https://example.com/chill.jpg");
    await expect(img).toHaveAttribute("alt", "Chill Vibes cover");

    // Title
    await expect(card.locator("h3")).toContainText("Chill Vibes");

    // Track count overlay
    await expect(card.locator("[data-testid='playlist-cover']"))
      .toContainText("42 tracks");
  });

  test("card shows placeholder when coverImageUrl is null", async ({
    page,
  }) => {
    const playlists = [
      {
        id: "pl-20",
        title: "No Cover Mix",
        coverImageUrl: null,
        trackCount: 7,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-20");
    await expect(card).toBeVisible();

    const cover = card.locator("[data-testid='playlist-cover']");
    // Should NOT have an img element
    await expect(cover.locator("img")).not.toBeVisible();
    // Should contain the music note symbol
    await expect(cover).toContainText("♪");
    // Still shows track count
    await expect(cover).toContainText("7 tracks");
  });

  test("card with zero tracks displays '0 tracks'", async ({ page }) => {
    const playlists = [
      {
        id: "pl-30",
        title: "Empty Playlist",
        coverImageUrl: "https://example.com/empty.jpg",
        trackCount: 0,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-30");
    await expect(card).toBeVisible();
    await expect(card.locator("[data-testid='playlist-cover']"))
      .toContainText("0 tracks");
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: Card is clickable and navigates to playlist detail           */
/* ------------------------------------------------------------------ */

test.describe("Playlists Grid — AC3: clickable navigation", () => {
  test("card is an anchor link pointing to playlist detail page", async ({
    page,
  }) => {
    const playlists = [
      {
        id: "pl-40",
        title: "Road Trip",
        coverImageUrl: "https://example.com/road.jpg",
        trackCount: 55,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-40");
    const link = card.locator("a");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/playlists/pl-40");
    await expect(link).toHaveAttribute(
      "aria-label",
      "Playlist: Road Trip with 55 tracks",
    );
  });

  test("card link has descriptive aria-label", async ({ page }) => {
    const playlists = [
      {
        id: "pl-50",
        title: "Coding Beats",
        coverImageUrl: "https://example.com/coding.jpg",
        trackCount: 120,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-50");
    const link = card.locator("a");
    await expect(link).toHaveAttribute(
      "aria-label",
      "Playlist: Coding Beats with 120 tracks",
    );
  });

  test("card link is keyboard-focusable", async ({ page }) => {
    const playlists = [
      {
        id: "pl-60",
        title: "Focus Mix",
        coverImageUrl: "https://example.com/focus.jpg",
        trackCount: 30,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-60");
    // Anchor tags are natively focusable; verify tab navigates to it
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute(
      "href",
      "/playlists/pl-60",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility & edge cases                                        */
/* ------------------------------------------------------------------ */

test.describe("Playlists Grid — accessibility and edge cases", () => {
  test("grid heading has proper aria-labelledby", async ({ page }) => {
    const playlists = [
      {
        id: "pl-70",
        title: "Test Playlist",
        coverImageUrl: "https://example.com/test.jpg",
        trackCount: 5,
        isPublic: true,
      },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    const grid = page.getByTestId("playlists-grid");
    // The grid section has aria-labelledby pointing to the heading id
    const section = page.locator('section[aria-labelledby="public-playlists-heading"]');
    await expect(section).toBeVisible();

    const heading = page.getByTestId("playlists-heading");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAttribute(
      "id",
      "public-playlists-heading",
    );
  });

  test("multiple cards all have stable data-testid values", async ({
    page,
  }) => {
    const playlists = [
      { id: "a", title: "A", coverImageUrl: null, trackCount: 1, isPublic: true },
      { id: "b", title: "B", coverImageUrl: null, trackCount: 2, isPublic: true },
      { id: "c", title: "C", coverImageUrl: null, trackCount: 3, isPublic: true },
    ];

    await mockProfileWithPlaylists(page, playlists);
    await page.goto(PROFILE_URL);

    for (const pl of playlists) {
      await expect(page.getByTestId(`playlist-card-${pl.id}`)).toBeVisible();
    }
  });
});

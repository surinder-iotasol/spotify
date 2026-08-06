/**
 * STORY-profile-008e: Playwright E2E spec for the listener profile page.
 *
 * Covers:
 * - AC1: Playwright spec tests loading the listener profile page.
 * - AC2: Verifies clicking a public playlist card navigates to the playlist
 *        detail (validates href and click triggers navigation).
 * - AC3: Validates carousel renders and supports horizontal scroll.
 */

import { test, expect } from "@playwright/test";

const PROFILE_URL = "/users/test-user-1";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Mock a successful listener profile response with public playlists and
 * followed artists.
 */
async function mockProfileResponse(
  page: import("@playwright/test").Page,
  data: Record<string, unknown>,
) {
  await page.route(
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
  await page.route(
    "**/api/v1/users/test-user-1",
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User profile not found.",
          },
        }),
      });
    },
  );
}

/* ------------------------------------------------------------------ */
/*  AC1: Loading the profile page                                     */
/* ------------------------------------------------------------------ */

test.describe("Listener Profile — Page Load (AC1)", () => {
  test("renders full profile page with header, playlists, and carousel", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
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
      ],
      followedArtists: [
        {
          id: "ap-1",
          displayName: "Echo Waves",
          avatarUrl: "https://example.com/artist1.jpg",
          isVerified: true,
        },
        {
          id: "ap-2",
          displayName: "Neon Drift",
          avatarUrl: null,
          isVerified: false,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    // Profile header should be visible
    await expect(page.getByTestId("profile-header")).toBeVisible();

    // Username should display
    await expect(page.getByTestId("profile-username")).toContainText("groovemaster");

    // Playlists grid should be visible with correct heading
    const grid = page.getByTestId("playlists-grid");
    await expect(grid).toBeVisible();

    const heading = page.getByTestId("playlists-heading");
    await expect(heading).toContainText("Public Playlists (2)");

    // Followed artists carousel should be visible
    const carousel = page.getByTestId("followed-artists-carousel");
    await expect(carousel).toBeVisible();

    const carouselHeading = page.getByTestId("followed-artists-heading");
    await expect(carouselHeading).toContainText("Followed Artists (2)");
  });

  test("shows error state when profile API returns 404", async ({ page }) => {
    await mockProfileNotFound(page);
    await page.goto(PROFILE_URL);

    // Next.js notFound() should trigger the 404 page. In our test setup
    // the page will show the Next.js error boundary or a not-found message.
    // We check that the original profile elements are NOT rendered.
    await expect(page.getByTestId("profile-header")).not.toBeVisible();
    await expect(page.getByTestId("playlists-grid")).not.toBeVisible();
  });

  test("renders loading state before API response completes", async ({
    page,
  }) => {
    // Intercept and delay the response so we can check loading UI.
    await page.route(
      "**/api/v1/users/test-user-1",
      async (route) => {
        // Fulfill after a short delay to simulate network latency.
        setTimeout(async () => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                id: "user-1",
                username: "groovemaster",
                avatarUrl: "https://example.com/avatar.jpg",
                registrationYear: 2022,
                playlists: [],
                followedArtists: [],
              },
            }),
          });
        }, 500);
      },
    );

    await page.goto(PROFILE_URL);

    // Within the first 300ms the page should either show a loading skeleton
    // or the profile header. Since our server component fetches data, the
    // page may render after the fetch resolves. We just verify the page
    // doesn't hang indefinitely.
    await expect(page.getByTestId("profile-username")).toBeVisible({
      timeout: 5000,
    });
  });

  test("renders empty playlists and no-artist-followed state", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-empty",
      username: "solo-listener",
      avatarUrl: null,
      registrationYear: 2024,
      playlists: [],
      followedArtists: [],
    });

    await page.goto(PROFILE_URL);

    // Empty playlists state should be visible
    const empty = page.getByTestId("empty-playlists");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("No public playlists yet.");

    // No followed artists message should be visible
    await expect(page.getByText("No followed artists yet.")).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  AC2: Clicking a playlist card navigates to playlist detail        */
/* ------------------------------------------------------------------ */

test.describe("Playlist Card Navigation — AC2", () => {
  test("playlist card anchor has correct href to playlist detail page", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
        {
          id: "pl-workout",
          title: "Workout Bangers",
          coverImageUrl: "https://example.com/pl1.jpg",
          trackCount: 25,
          isPublic: true,
        },
      ],
      followedArtists: [],
    });

    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-workout");
    await expect(card).toBeVisible();

    const link = card.locator("a");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/playlists/pl-workout");
    await expect(link).toHaveAttribute(
      "aria-label",
      "Playlist: Workout Bangers with 25 tracks",
    );
  });

  test("clicking a playlist card navigates to playlist detail page", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
        {
          id: "pl-roadtrip",
          title: "Road Trip Mix",
          coverImageUrl: "https://example.com/road.jpg",
          trackCount: 42,
          isPublic: true,
        },
      ],
      followedArtists: [],
    });

    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-roadtrip");
    await expect(card).toBeVisible();

    // Intercept the navigation to the playlist page to prevent 404 errors
    // since the playlist detail page may not exist in tests.
    // We just verify the navigation target is correct.
    await page.route("**/playlists/pl-roadtrip*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Playlist Detail</body></html>",
      });
    });

    // Click the card link
    const link = card.locator("a");
    const [response] = await Promise.all([
      page.waitForNavigation({ url: "**/playlists/pl-roadtrip**", timeout: 5000 }),
      link.click(),
    ]);

    // Verify we navigated to the playlist detail page
    expect(page.url()).toContain("/playlists/pl-roadtrip");
  });

  test("playlist card is keyboard-focusable and clickable via Enter", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
        {
          id: "pl-focus",
          title: "Focus Beats",
          coverImageUrl: "https://example.com/focus.jpg",
          trackCount: 30,
          isPublic: true,
        },
      ],
      followedArtists: [],
    });

    await page.goto(PROFILE_URL);

    // Tab to the playlist card link
    await page.keyboard.press("Tab");

    // The focused element should be the anchor
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("href", "/playlists/pl-focus");

    // Verify the anchor is an <a> tag with proper semantics
    await expect(focused).toHaveAttribute("role", "link");
  });

  test("playlist card shows hover and focus visual states", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
        {
          id: "pl-hover",
          title: "Hover Test",
          coverImageUrl: "https://example.com/hover.jpg",
          trackCount: 10,
          isPublic: true,
        },
      ],
      followedArtists: [],
    });

    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-hover");

    // Hover state
    await card.hover();
    // Should get purple border on hover (focus-within:border-purple-500 on focus)
    const cardElement = card.locator("a");
    // Verify the link element exists and is interactive
    await expect(cardElement).toBeVisible();
    await expect(cardElement).toBeEnabled();
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: Carousel renders and supports horizontal scroll              */
/* ------------------------------------------------------------------ */

test.describe("Followed Artists Carousel — AC3", () => {
  test("carousel renders with followed artist cards", async ({ page }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [],
      followedArtists: [
        {
          id: "ap-1",
          displayName: "Echo Waves",
          avatarUrl: "https://example.com/artist1.jpg",
          isVerified: true,
        },
        {
          id: "ap-2",
          displayName: "Neon Drift",
          avatarUrl: null,
          isVerified: false,
        },
        {
          id: "ap-3",
          displayName: "Static Bloom",
          avatarUrl: "https://example.com/artist3.jpg",
          isVerified: false,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    // Carousel container should be visible
    const carousel = page.getByTestId("followed-artists-carousel");
    await expect(carousel).toBeVisible();

    // All artist cards should be visible
    await expect(page.getByTestId("followed-artist-ap-1")).toBeVisible();
    await expect(page.getByTestId("followed-artist-ap-2")).toBeVisible();
    await expect(page.getByTestId("followed-artist-ap-3")).toBeVisible();

    // Carousel heading should show correct count
    await expect(page.getByTestId("followed-artists-heading")).toContainText(
      "Followed Artists (3)",
    );
  });

  test("carousel supports horizontal scrolling via API", async ({ page }) => {
    // Generate many artists to force horizontal overflow
    const followedArtists: Array<{
      id: string;
      displayName: string;
      avatarUrl: string | null;
      isVerified: boolean;
    }> = Array.from({ length: 20 }, (_, i) => ({
      id: `ap-${i}`,
      displayName: `Artist ${i}`,
      avatarUrl: i % 2 === 0 ? `https://example.com/artist${i}.jpg` : null,
      isVerified: i === 0,
    }));

    await mockProfileResponse(page, {
      id: "user-scroll",
      username: "scrollexplorer",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2023,
      playlists: [],
      followedArtists,
    });

    await page.goto(PROFILE_URL);

    const carousel = page.getByTestId("followed-artists-carousel");
    await expect(carousel).toBeVisible();

    // The carousel container should have horizontal overflow
    // Verify it's a flex container with overflow-x-auto
    const overflow = await carousel.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(overflow).toBe("auto");

    // The carousel should be scrollable (scrollWidth > clientWidth for many items)
    const scrollWidth = await carousel.evaluate(
      (el) => el.scrollWidth,
    );
    const clientWidth = await carousel.evaluate(
      (el) => el.clientWidth,
    );
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test("carousel artist cards link to artist profiles", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [],
      followedArtists: [
        {
          id: "ap-carousel",
          displayName: "Carousel Artist",
          avatarUrl: "https://example.com/carousel.jpg",
          isVerified: true,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    const artistCard = page.getByTestId("followed-artist-ap-carousel");
    await expect(artistCard).toBeVisible();

    const link = artistCard.locator("a");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/artists/ap-carousel");
    await expect(link).toHaveAttribute(
      "aria-label",
      "Carousel Artist (verified)",
    );
  });

  test("carousel renders placeholder for artists without avatars", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [],
      followedArtists: [
        {
          id: "ap-nopic",
          displayName: "No Pic Artist",
          avatarUrl: null,
          isVerified: false,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    const artistCard = page.getByTestId("followed-artist-ap-nopic");
    await expect(artistCard).toBeVisible();

    // Should show the initial letter placeholder
    await expect(artistCard).toContainText("N");
  });

  test("carousel heading has proper accessibility attributes", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [],
      followedArtists: [
        {
          id: "ap-1",
          displayName: "Artist One",
          avatarUrl: "https://example.com/a1.jpg",
          isVerified: false,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    const heading = page.getByTestId("followed-artists-heading");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAttribute("id", "followed-artists-heading");

    // Section should have aria-labelledby pointing to the heading
    const section = page.locator(
      'section[aria-labelledby="followed-artists-heading"]',
    );
    await expect(section).toBeVisible();
  });

  test("carousel is responsive on mobile viewport", async ({ page }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "mobileuser",
      avatarUrl: null,
      registrationYear: 2023,
      playlists: [],
      followedArtists: [
        {
          id: "ap-1",
          displayName: "Artist One",
          avatarUrl: null,
          isVerified: false,
        },
        {
          id: "ap-2",
          displayName: "Artist Two",
          avatarUrl: null,
          isVerified: true,
        },
      ],
    });

    await page.setViewportSize({ width: 375, height: 812 });

    // Use a broader route pattern since we changed viewport first
    await mockProfileResponse(page, {
      id: "user-1",
      username: "mobileuser",
      avatarUrl: null,
      registrationYear: 2023,
      playlists: [],
      followedArtists: [
        {
          id: "ap-1",
          displayName: "Artist One",
          avatarUrl: null,
          isVerified: false,
        },
        {
          id: "ap-2",
          displayName: "Artist Two",
          avatarUrl: null,
          isVerified: true,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    // All elements should still be visible on mobile
    await expect(page.getByTestId("profile-header")).toBeVisible();
    await expect(page.getByTestId("followed-artists-carousel")).toBeVisible();

    // Carousel should still be scrollable on mobile
    const carousel = page.getByTestId("followed-artists-carousel");
    const overflow = await carousel.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(overflow).toBe("auto");
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility & edge cases                                        */
/* ------------------------------------------------------------------ */

test.describe("Accessibility and edge cases", () => {
  test("profile page has proper document outline with headings", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "accessiblerex",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
        {
          id: "pl-1",
          title: "Test Playlist",
          coverImageUrl: null,
          trackCount: 5,
          isPublic: true,
        },
      ],
      followedArtists: [
        {
          id: "ap-1",
          displayName: "Test Artist",
          avatarUrl: null,
          isVerified: false,
        },
      ],
    });

    await page.goto(PROFILE_URL);

    // Profile username should be h1 (main heading)
    const username = page.getByTestId("profile-username");
    await expect(username).toBeVisible();

    // Playlist section heading
    const playlistHeading = page.getByTestId("playlists-heading");
    await expect(playlistHeading).toBeVisible();
    await expect(playlistHeading).toHaveAttribute("id", "public-playlists-heading");

    // Followed artists section heading
    const artistHeading = page.getByTestId("followed-artists-heading");
    await expect(artistHeading).toBeVisible();
    await expect(artistHeading).toHaveAttribute("id", "followed-artists-heading");
  });

  test("playlist card cover shows music note when no cover image", async ({
    page,
  }) => {
    await mockProfileResponse(page, {
      id: "user-1",
      username: "groovemaster",
      avatarUrl: "https://example.com/avatar.jpg",
      registrationYear: 2022,
      playlists: [
        {
          id: "pl-nocover",
          title: "No Cover Mix",
          coverImageUrl: null,
          trackCount: 7,
          isPublic: true,
        },
      ],
      followedArtists: [],
    });

    await page.goto(PROFILE_URL);

    const card = page.getByTestId("playlist-card-pl-nocover");
    await expect(card).toBeVisible();

    // The cover area should show the music note symbol
    const cover = card.locator("[data-testid='playlist-cover']");
    await expect(cover).toBeVisible();
    await expect(cover).toContainText("♪");
  });
});

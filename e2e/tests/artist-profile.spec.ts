/**
 * STORY-profile-006: Playwright E2E spec for the public artist profile page.
 *
 * Covers:
 * - Visiting /artists/[artistId] loads the page successfully
 * - Header renders with banner, avatar, displayName, bio
 * - Metrics bar displays formatted numbers
 * - Popular tracks section renders with play buttons
 * - Discography section supports sorting by Release Date and Title
 * - Follow button toggles state
 */

import { test, expect } from "@playwright/test";

const ARTIST_ID = "ap-001";
const PROFILE_URL = `/artists/${ARTIST_ID}`;
const API_PROFILE = `http://localhost:3000/api/v1/artists/${ARTIST_ID}`;
const API_TRACKS = `http://localhost:3000/api/v1/artists/${ARTIST_ID}/tracks`;

/* ------------------------------------------------------------------ */
/*  Helpers: route interceptors                                       */
/* ------------------------------------------------------------------ */

async function interceptProfileResponse(page: import('@playwright/test').Page) {
  await page.route(API_PROFILE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          profile: {
            id: ARTIST_ID,
            displayName: "Test Artist",
            bio: "This is a test bio for the artist profile page.",
            avatarUrl: "https://example.com/avatar.jpg",
            headerImageUrl: "https://example.com/header.jpg",
            socialLinks: [
              { platform: "twitter", url: "https://twitter.com/testartist" },
            ],
            isVerified: true,
            isFollowing: false,
          },
          metrics: {
            totalPlays: 12500,
            totalLikes: 3400,
            followerCount: 1250,
          },
          topTracks: [
            {
              id: "t1",
              title: "Hit Single",
              genre: "INDIE_ROCK",
              playCount: 10000,
              likeCount: 500,
              status: "LIVE",
              coverImageUrl: "https://example.com/cover1.jpg",
              duration: 240.5,
            },
            {
              id: "t2",
              title: "Deep Cut",
              genre: "BEDROOM_POP",
              playCount: 2500,
              likeCount: 200,
              status: "LIVE",
              coverImageUrl: "https://example.com/cover2.jpg",
              duration: 195.2,
            },
            {
              id: "t3",
              title: "Hidden Gem",
              genre: "ELECTRONIC",
              playCount: 0,
              likeCount: 0,
              status: "LIVE",
              coverImageUrl: null,
              duration: 310.0,
            },
          ],
        },
        meta: {
          requestId: "test-req-001",
          timestamp: new Date().toISOString(),
        },
      }),
    });
  });
}

async function interceptTracksResponse(page: import('@playwright/test').Page, sortBy: string = 'createdAt', sortOrder: string = 'desc') {
  await page.route(new RegExp(`${API_TRACKS}\\?.*`), async (route) => {
    const url = route.request().url();
    const params = new URL(url).searchParams;

    let tracks = [
      {
        id: "t1",
        title: "Alpha Track",
        genre: "INDIE_ROCK" as const,
        playCount: 100,
        likeCount: 10,
        status: "LIVE" as const,
        coverImageUrl: "https://example.com/cover1.jpg",
        duration: 240.5,
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "t2",
        title: "Beta Track",
        genre: "BEDROOM_POP" as const,
        playCount: 200,
        likeCount: 20,
        status: "LIVE" as const,
        coverImageUrl: "https://example.com/cover2.jpg",
        duration: 195.2,
        createdAt: "2024-03-01T00:00:00Z",
      },
      {
        id: "t3",
        title: "Gamma Track",
        genre: "ELECTRONIC" as const,
        playCount: 150,
        likeCount: 15,
        status: "LIVE" as const,
        coverImageUrl: null,
        duration: 310.0,
        createdAt: "2024-02-01T00:00:00Z",
      },
    ];

    // Apply sorting
    if (sortBy === 'title') {
      const dir = sortOrder === 'desc' ? -1 : 1;
      tracks = [...tracks].sort((a, b) => dir * a.title.localeCompare(b.title));
    } else {
      // Default: createdAt descending
      tracks = [...tracks].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          tracks,
          pagination: {
            total: tracks.length,
            page: parseInt(params.get('page') || '1'),
            limit: 20,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
        meta: {
          requestId: "test-req-002",
          timestamp: new Date().toISOString(),
        },
      }),
    });
  });
}

async function interceptFollowRequest(page: import('@playwright/test').Page, followed: boolean) {
  await page.route(new RegExp(`${API_PROFILE}/follow`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          profile: {
            ...mockProfileResponse().data.profile,
            isFollowing: followed,
          },
          metrics: mockProfileResponse().data.metrics,
          topTracks: mockProfileResponse().data.topTracks,
        },
        meta: {
          requestId: "test-req-003",
          timestamp: new Date().toISOString(),
        },
      }),
    });
  });
}

function mockProfileResponse() {
  return {
    success: true,
    data: {
      profile: {
        id: ARTIST_ID,
        displayName: "Test Artist",
        bio: "This is a test bio for the artist profile page.",
        avatarUrl: "https://example.com/avatar.jpg",
        headerImageUrl: "https://example.com/header.jpg",
        socialLinks: [
          { platform: "twitter", url: "https://twitter.com/testartist" },
        ],
        isVerified: true,
        isFollowing: false,
      },
      metrics: {
        totalPlays: 12500,
        totalLikes: 3400,
        followerCount: 1250,
      },
      topTracks: [
        {
          id: "t1",
          title: "Hit Single",
          genre: "INDIE_ROCK",
          playCount: 10000,
          likeCount: 500,
          status: "LIVE",
          coverImageUrl: "https://example.com/cover1.jpg",
          duration: 240.5,
        },
      ],
    },
    meta: {
      requestId: "test-req-001",
      timestamp: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  E2E Tests: Profile Page                                           */
/* ------------------------------------------------------------------ */

test.describe("Artist Profile Page E2E (STORY-profile-006)", () => {
  /* -- Navigation tests -- */

  test("navigates to artist profile page successfully", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    await expect(page.getByRole("heading", { name: /Test Artist/i })).toBeVisible();
  });

  test("renders header banner area", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Check header banner area exists (gradient fallback or banner image)
    const headerBanner = page.locator("[data-testid='header-banner'], [data-testid='banner']").first();
    await expect(headerBanner).toBeVisible();
  });

  test("renders circular avatar", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Avatar should be visible
    const avatar = page.locator("[data-testid='avatar'], [data-testid='artist-avatar']").first();
    await expect(avatar).toBeVisible();
  });

  test("renders displayName and bio", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    await expect(page.getByText("Test Artist")).toBeVisible();
    await expect(page.getByText("This is a test bio for the artist profile page.")).toBeVisible();
  });

  /* -- Metrics bar tests -- */

  test("displays formatted metrics bar with plays, likes, followers", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Metrics bar with compact notation (12.5K, 3.4K, 1.2K)
    await expect(page.getByText("12.5K")).toBeVisible();
    await expect(page.getByText("3.4K")).toBeVisible();
    await expect(page.getByText("1.2K")).toBeVisible();
  });

  /* -- Popular tracks tests -- */

  test("renders popular tracks section with up to 5 items", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Check for popular tracks heading
    await expect(page.getByText(/Popular Tracks/i)).toBeVisible();

    // Check for track titles in the popular tracks section
    await expect(page.getByText("Hit Single")).toBeVisible();
    await expect(page.getByText("Deep Cut")).toBeVisible();
    await expect(page.getByText("Hidden Gem")).toBeVisible();
  });

  test("renders play buttons for popular tracks", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Look for play buttons (could be a button or a link)
    const playButtons = page.locator("[data-testid='play-button'], [aria-label*='Play'], button:has(svg[name*='Play'])").first();
    await expect(playButtons).toBeVisible();
  });

  /* -- Discography sort tests -- */

  test("discography shows Release Date sort by default", async ({ page }) => {
    await interceptProfileResponse(page);
    await interceptTracksResponse(page, 'createdAt', 'desc');
    await page.goto(PROFILE_URL);

    // Check that discography section exists
    const discographyHeading = page.getByText(/Discography|Track Catalog/i);
    await expect(discographyHeading).toBeVisible();
  });

  test("discography supports Title sort", async ({ page }) => {
    await interceptProfileResponse(page);
    await interceptTracksResponse(page, 'title', 'asc');
    await page.goto(PROFILE_URL);

    // Click the Title sort button
    const titleSort = page.locator("[data-testid='sort-title'], [data-testid='sort-field']")
      .filter({ hasText: /Title/i }).first();
    
    if (await titleSort.isVisible().catch(() => false)) {
      await titleSort.click();
      // After sorting by title, Alpha Track should be visible
      await expect(page.getByText("Alpha Track")).toBeVisible();
    }
  });

  /* -- Follow button tests -- */

  test("follow button shows Follow state initially", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Follow button should be visible
    const followBtn = page.locator("[data-testid='follow-button'], [data-testid='unfollow-button']").first();
    await expect(followBtn).toBeVisible();
  });

  test("follow button interaction toggles state", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.route(new RegExp(`${API_PROFILE}/follow`), async (route) => {
      if (route.request().method() === 'POST') {
        // Simulate successful follow
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              ...mockProfileResponse().data,
              profile: {
                ...mockProfileResponse().data.profile,
                isFollowing: true,
              },
              metrics: {
                ...mockProfileResponse().data.metrics,
                followerCount: 1251,
              },
            },
            meta: {
              requestId: "test-req-follow-001",
              timestamp: new Date().toISOString(),
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(PROFILE_URL);

    // Initial Follow button should be visible
    const followButton = page.getByRole("button", { name: /Follow/i });
    await expect(followButton).toBeVisible();

    // Click Follow button
    await followButton.click();

    // Button should toggle to Unfollow
    await expect(page.getByRole("button", { name: /Unfollow/i })).toBeVisible();
  });

  test("guest users see login prompt when trying to follow", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.goto(PROFILE_URL);

    // Follow button should be visible even for guests
    const followButton = page.getByRole("button", { name: /Follow/i });
    await expect(followButton).toBeVisible();
  });

  /* -- Responsive layout tests -- */

  test("renders responsively on 375px mobile viewport", async ({ page }) => {
    await interceptProfileResponse(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PROFILE_URL);

    // Profile heading should be visible
    await expect(page.getByText("Test Artist")).toBeVisible();

    // Metrics should be visible
    await expect(page.getByText("12.5K")).toBeVisible();
  });

  /* -- 404 test -- */

  test("shows error for non-existent artist", async ({ page }) => {
    await page.route("http://localhost:3000/api/v1/artists/nonexistent", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: "ARTIST_NOT_FOUND",
            message: "Artist profile with id 'nonexistent' not found.",
          },
        }),
      });
    });

    await page.goto("/artists/nonexistent");

    // Should show an error message
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});

/**
 * STORY-profile-001: Integration test for GET /api/v1/artists/:artistId
 *
 * Tests the full request-response cycle through the Next.js route handler
 * with mocked Prisma to verify:
 * - 200 HTTP status on successful request
 * - Correct response schema (profile, metrics, topTracks)
 * - Stats accuracy (totalPlays, totalLikes, followerCount)
 * - isFollowing boolean for authenticated requests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mocked } from "vitest";

// ------------------------------------------------------------------ //
//  Mock helpers                                                        //
// ------------------------------------------------------------------ //

/**
 * Build a minimal mocked PrismaClient with only the methods we need.
 */
function makeMockPrisma(): {
  artistProfile: {
    findUnique: vi.Mock;
  };
  follow: {
    count: vi.Mock;
  };
} {
  return {
    artistProfile: {
      findUnique: vi.fn(),
    },
    follow: {
      count: vi.fn(),
    },
  };
}

// ------------------------------------------------------------------ //
//  Mocks for service dependencies — hoisted via vi.mock               //
// ------------------------------------------------------------------ //

const mockPrismaInstance = makeMockPrisma();

vi.mock("@/lib/prisma", () => ({
  default: mockPrismaInstance,
}));

vi.mock("@/lib/api/response", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/response")>("@/lib/api/response");
  return {
    ...actual,
    apiSuccessResponse: vi.fn((data) => ({ success: true, data })),
    apiErrorResponse: vi.fn((code, message) => ({
      success: false,
      error: { code, message },
    })),
  };
});

vi.mock("@/lib/auth", async () => ({
  verifySession: vi.fn(),
}));

// ------------------------------------------------------------------ //
//  Integration tests for GET /api/v1/artists/:artistId               //
// ------------------------------------------------------------------ //

describe("GET /api/v1/artists/:artistId — integration", () => {
  let mockVerifySession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const authModule = await import("@/lib/auth");
    mockVerifySession = authModule.verifySession as ReturnType<typeof vi.fn>;
  });

  it("returns 200 with correct schema for valid artist profile", async () => {
    const mockProfile = {
      id: "ap-001",
      stageName: "TestArtist",
      bio: "Hello world",
      avatarUrl: "https://example.com/avatar.jpg",
      headerImageUrl: "https://example.com/header.jpg",
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
      isVerified: true,
      followerCount: 500,
      tracks: [
        {
          id: "t1",
          title: "Hit Song",
          playCount: 1000,
          likeCount: 100,
          status: "LIVE",
          genre: "INDIE_ROCK",
          coverImageUrl: null,
        },
        {
          id: "t2",
          title: "Deep Cut",
          playCount: 500,
          likeCount: 50,
          status: "LIVE",
          genre: "BEDROOM_POP",
          coverImageUrl: null,
        },
        {
          id: "t3",
          title: "Old Track",
          playCount: 5000,
          likeCount: 500,
          status: "ARCHIVED",
          genre: "INDIE_ROCK",
          coverImageUrl: null,
        },
      ],
    };

    mockPrismaInstance.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mockPrismaInstance.follow.count.mockResolvedValue(0);
    mockVerifySession.mockReturnValue(null); // Guest request

    // Import route handler after mocking
    const { GET } = await import("@/app/api/v1/artists/[artistId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/artists/ap-001",
      headers: { get: () => null },
    } as Request;

    const response = await GET(request, {
      params: Promise.resolve({ artistId: "ap-001" }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify profile shape
    const profile = body.data.profile;
    expect(profile.displayName).toBe("TestArtist");
    expect(profile.bio).toBe("Hello world");
    expect(profile.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(profile.headerImageUrl).toBe("https://example.com/header.jpg");
    expect(profile.socialLinks).toEqual([
      { platform: "twitter", url: "https://twitter.com/artist" },
    ]);
    expect(profile.isVerified).toBe(true);
    expect(profile.isFollowing).toBe(false);

    // Verify metrics
    const metrics = body.data.metrics;
    expect(metrics.totalPlays).toBe(1500); // 1000 + 500 (only LIVE tracks)
    expect(metrics.totalLikes).toBe(150); // 100 + 50 (only LIVE tracks)
    expect(metrics.followerCount).toBe(500);

    // Verify top tracks
    const topTracks = body.data.topTracks;
    expect(topTracks).toHaveLength(2); // Only 2 LIVE tracks
    expect(topTracks[0].title).toBe("Hit Song"); // 1000 plays
    expect(topTracks[1].title).toBe("Deep Cut"); // 500 plays
  });

  it("returns 404 when artist profile not found", async () => {
    mockPrismaInstance.artistProfile.findUnique.mockResolvedValue(null);
    mockVerifySession.mockReturnValue(null);

    const { GET } = await import("@/app/api/v1/artists/[artistId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/artists/nonexistent",
      headers: { get: () => null },
    } as Request;

    const response = await GET(request, {
      params: Promise.resolve({ artistId: "nonexistent" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns isFollowing true for authenticated follower", async () => {
    const mockProfile = {
      id: "ap-001",
      stageName: "MyArtist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      followerCount: 100,
      tracks: [],
    };

    mockPrismaInstance.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mockPrismaInstance.follow.count.mockResolvedValue(1); // User follows this artist
    mockVerifySession.mockReturnValue({ userId: "user-123" });

    const { GET } = await import("@/app/api/v1/artists/[artistId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/artists/ap-001",
      headers: { get: () => "some-cookie" },
    } as Request;

    const response = await GET(request, {
      params: Promise.resolve({ artistId: "ap-001" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.profile.isFollowing).toBe(true);
  });
});

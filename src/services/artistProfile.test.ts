/**
 * STORY-profile-001: Unit tests for the artist profile service.
 *
 * Covers:
 *  - Aggregation calculations (totalPlays, totalLikes, followerCount)
 *  - Popular track selection (top 5 LIVE tracks by playCount desc)
 *  - Guest request handling (no authenticated user)
 *  - Authenticated user with isFollowing boolean
 *  - Artist not found returns 404
 *  - Empty artist (no tracks, no followers) returns zeros
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getArtistPublicProfile,
  mapArtistProfileToResponse,
  computeAggregatedMetrics,
  getTopTracks,
  checkUserFollowing,
  ARTIST_PROFILE_ERRORS,
  type ArtistPublicProfileResponse,
  type AggregatedMetrics,
  type TopTrack,
} from "./artistProfile";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const TEST_JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";

/**
 * Create a minimal Prisma mock for artist profile queries.
 */
function createMockPrisma(
  artistProfile?: Record<string, unknown>,
  tracks: Record<string, unknown>[] = [],
  follows: Record<string, unknown>[] = [],
  likes: Record<string, unknown>[] = [],
) {
  const mockPrisma = {
    artistProfile: {
      findUnique: vi.fn(async ({ where, include }) => {
        if (!artistProfile) return null;
        if (include?.tracks) {
          return {
            ...artistProfile,
            tracks,
          };
        }
        return artistProfile;
      }),
    },
    follow: {
      count: vi.fn(async ({ where }) => {
        return follows.filter((f) => f.artistProfileId === where.artistProfileId).length;
      }),
    },
    like: {
      count: vi.fn(async ({ where }) => {
        // Filter likes that match the artist's tracks
        const trackIds = (tracks as { id: string }[]).map((t) => t.id);
        return likes.filter((l) => trackIds.includes(l.trackId)).length;
      }),
    },
    track: {
      findMany: vi.fn(async ({ where }) => {
        return tracks.filter(
          (t) => t.artistProfileId === where.artistProfileId,
        );
      }),
    },
  };
  return mockPrisma as unknown as ReturnType<typeof import("@/lib/prisma").default>;
}

/* ------------------------------------------------------------------ */
/*  Setup & Teardown: control JWT_SECRET for the auth module          */
/* ------------------------------------------------------------------ */

let originalJwtSecret: string | undefined;

beforeEach(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

afterEach(() => {
  if (originalJwtSecret !== undefined) {
    process.env.JWT_SECRET = originalJwtSecret;
  } else {
    delete process.env.JWT_SECRET;
  }
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests: Aggregation Calculations                                   */
/* ------------------------------------------------------------------ */

describe("computeAggregatedMetrics", () => {
  it("sums playCounts from LIVE tracks only", () => {
    const tracks = [
      { id: "t1", status: "LIVE" as const, playCount: 100 },
      { id: "t2", status: "LIVE" as const, playCount: 200 },
      { id: "t3", status: "ARCHIVED" as const, playCount: 999 },
    ];
    const metrics = computeAggregatedMetrics(tracks);
    expect(metrics.totalPlays).toBe(300); // 100 + 200, not 999
  });

  it("returns 0 totalPlays when no tracks exist", () => {
    const metrics = computeAggregatedMetrics([]);
    expect(metrics.totalPlays).toBe(0);
  });

  it("counts likes across LIVE tracks via track likeCount", () => {
    const tracks = [
      { id: "t1", status: "LIVE" as const, likeCount: 10 },
      { id: "t2", status: "LIVE" as const, likeCount: 20 },
      { id: "t3", status: "ARCHIVED" as const, likeCount: 50 },
    ];
    const metrics = computeAggregatedMetrics(tracks);
    expect(metrics.totalLikes).toBe(30); // 10 + 20, not 50
  });

  it("respects followerCount from ArtistProfile", () => {
    const profile = {
      id: "ap-001",
      stageName: "TestArtist",
      bio: "Test bio",
      avatarUrl: "https://example.com/avatar.jpg",
      headerImageUrl: "https://example.com/header.jpg",
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
      isVerified: true,
      followerCount: 1234,
    };
    const metrics = computeAggregatedMetrics([], profile);
    expect(metrics.followerCount).toBe(1234);
  });

  it("returns followerCount 0 when profile is missing", () => {
    const metrics = computeAggregatedMetrics([], undefined);
    expect(metrics.followerCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Popular Track Selection                                     */
/* ------------------------------------------------------------------ */

describe("getTopTracks", () => {
  it("returns top 5 LIVE tracks ordered by playCount descending", () => {
    const tracks = [
      { id: "t1", title: "Song A", playCount: 500, status: "LIVE" as const },
      { id: "t2", title: "Song B", playCount: 1000, status: "LIVE" as const },
      { id: "t3", title: "Song C", playCount: 300, status: "LIVE" as const },
      { id: "t4", title: "Song D", playCount: 800, status: "LIVE" as const },
      { id: "t5", title: "Song E", playCount: 200, status: "LIVE" as const },
      { id: "t6", title: "Song F", playCount: 400, status: "LIVE" as const },
      { id: "t7", title: "Song G", playCount: 700, status: "ARCHIVED" as const },
    ];
    const top = getTopTracks(tracks);
    expect(top).toHaveLength(5);
    expect(top[0].playCount).toBe(1000);
    expect(top[1].playCount).toBe(800);
    expect(top[2].playCount).toBe(500);
    expect(top[3].playCount).toBe(400);
    expect(top[4].playCount).toBe(300);
  });

  it("returns fewer than 5 when fewer LIVE tracks exist", () => {
    const tracks = [
      { id: "t1", title: "Song A", playCount: 500, status: "LIVE" as const },
      { id: "t2", title: "Song B", playCount: 300, status: "LIVE" as const },
    ];
    const top = getTopTracks(tracks);
    expect(top).toHaveLength(2);
  });

  it("returns empty array when no tracks exist", () => {
    const top = getTopTracks([]);
    expect(top).toHaveLength(0);
  });

  it("excludes non-LIVE tracks from the result", () => {
    const tracks = [
      { id: "t1", title: "Song A", playCount: 1000, status: "ARCHIVED" as const },
      { id: "t2", title: "Song B", playCount: 500, status: "LIVE" as const },
    ];
    const top = getTopTracks(tracks);
    expect(top).toHaveLength(1);
    expect(top[0].title).toBe("Song B");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Map Artist Profile to Response                             */
/* ------------------------------------------------------------------ */

describe("mapArtistProfileToResponse", () => {
  it("maps ArtistProfile fields to public profile response", () => {
    const profile = {
      id: "ap-001",
      stageName: "TestArtist",
      bio: "Test bio",
      avatarUrl: "https://example.com/avatar.jpg",
      headerImageUrl: "https://example.com/header.jpg",
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
      isVerified: true,
      createdAt: new Date("2024-01-01").toISOString(),
      updatedAt: new Date("2024-06-01").toISOString(),
    };
    const response = mapArtistProfileToResponse(profile as any, false);
    expect(response.id).toBe("ap-001");
    expect(response.displayName).toBe("TestArtist");
    expect(response.bio).toBe("Test bio");
    expect(response.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(response.headerImageUrl).toBe("https://example.com/header.jpg");
    expect(response.socialLinks).toEqual([{ platform: "twitter", url: "https://twitter.com/artist" }]);
    expect(response.isVerified).toBe(true);
    expect(response.isFollowing).toBe(false);
  });

  it("handles null bio and optional URL fields", () => {
    const profile = {
      id: "ap-001",
      stageName: "TestArtist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      createdAt: new Date("2024-01-01").toISOString(),
      updatedAt: new Date("2024-06-01").toISOString(),
    };
    const response = mapArtistProfileToResponse(profile as any, true);
    expect(response.displayName).toBe("TestArtist");
    expect(response.bio).toBeNull();
    expect(response.avatarUrl).toBeNull();
    expect(response.headerImageUrl).toBeNull();
    expect(response.socialLinks).toBeNull();
    expect(response.isFollowing).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Guest Request Handling                                      */
/* ------------------------------------------------------------------ */

describe("getArtistPublicProfile — guest requests", () => {
  it("returns public profile without requiring authentication", async () => {
    const artistProfile = {
      id: "ap-001",
      stageName: "GuestArtist",
      bio: "Hello world",
      avatarUrl: "https://example.com/avatar.jpg",
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      followerCount: 100,
      trackCount: 5,
      createdAt: new Date("2024-01-01").toISOString(),
      updatedAt: new Date("2024-06-01").toISOString(),
    };
    const tracks = [
      { id: "t1", title: "Hit Song", playCount: 5000, likeCount: 200, status: "LIVE" as const },
    ];
    const mockPrisma = createMockPrisma(artistProfile, tracks, [], []);

    const result = await getArtistPublicProfile(mockPrisma, "ap-001", null);
    expect(result.success).toBe(true);
    expect(result.data.profile.displayName).toBe("GuestArtist");
    expect(result.data.profile.isFollowing).toBe(false);
    expect(result.data.metrics.totalPlays).toBe(5000);
    expect(result.data.metrics.totalLikes).toBe(200);
    expect(result.data.metrics.followerCount).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Authenticated User with isFollowing                        */
/* ------------------------------------------------------------------ */

describe("getArtistPublicProfile — authenticated requests", () => {
  it("returns isFollowing true when user follows the artist", async () => {
    const artistProfile = {
      id: "ap-001",
      stageName: "FavArtist",
      bio: null,
      avatarUrl: "https://example.com/avatar.jpg",
      headerImageUrl: null,
      socialLinks: null,
      isVerified: true,
      followerCount: 500,
      trackCount: 3,
      createdAt: new Date("2024-01-01").toISOString(),
      updatedAt: new Date("2024-06-01").toISOString(),
    };
    const tracks = [
      { id: "t1", title: "Song", playCount: 100, likeCount: 10, status: "LIVE" as const },
    ];
    const mockPrisma = createMockPrisma(artistProfile, tracks, [
      { id: "f1", userId: "user-1", artistProfileId: "ap-001" },
    ], []);

    const session = { userId: "user-1" } as any;
    const result = await getArtistPublicProfile(mockPrisma, "ap-001", session);
    expect(result.success).toBe(true);
    expect(result.data.profile.isFollowing).toBe(true);
  });

  it("returns isFollowing false when user does not follow the artist", async () => {
    const artistProfile = {
      id: "ap-001",
      stageName: "OtherArtist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      followerCount: 0,
      trackCount: 0,
      createdAt: new Date("2024-01-01").toISOString(),
      updatedAt: new Date("2024-06-01").toISOString(),
    };
    const mockPrisma = createMockPrisma(artistProfile, [], [], []);

    const session = { userId: "user-999" } as any;
    const result = await getArtistPublicProfile(mockPrisma, "ap-001", session);
    expect(result.success).toBe(true);
    expect(result.data.profile.isFollowing).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Artist Not Found                                           */
/* ------------------------------------------------------------------ */

describe("getArtistPublicProfile — artist not found", () => {
  it("returns 404 when artist profile does not exist", async () => {
    const mockPrisma = createMockPrisma(undefined, [], [], []);

    const result = await getArtistPublicProfile(mockPrisma, "nonexistent", null);
    expect(result.success).toBe(false);
    expect(result.code).toBe(ARTIST_PROFILE_ERRORS.NOT_FOUND);
    expect(result.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Empty Artist Profile                                       */
/* ------------------------------------------------------------------ */

describe("getArtistPublicProfile — empty artist", () => {
  it("returns zeroed metrics and empty top tracks for artist with no data", async () => {
    const artistProfile = {
      id: "ap-002",
      stageName: "NewArtist",
      bio: "Just starting out",
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      followerCount: 0,
      trackCount: 0,
      createdAt: new Date("2024-06-01").toISOString(),
      updatedAt: new Date("2024-06-01").toISOString(),
    };
    const mockPrisma = createMockPrisma(artistProfile, [], [], []);

    const result = await getArtistPublicProfile(mockPrisma, "ap-002", null);
    expect(result.success).toBe(true);
    expect(result.data.metrics.totalPlays).toBe(0);
    expect(result.data.metrics.totalLikes).toBe(0);
    expect(result.data.metrics.followerCount).toBe(0);
    expect(result.data.topTracks).toHaveLength(0);
    expect(result.data.profile.displayName).toBe("NewArtist");
    expect(result.data.profile.bio).toBe("Just starting out");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: checkUserFollowing helper                                  */
/* ------------------------------------------------------------------ */

describe("checkUserFollowing", () => {
  it("returns true when a Follow record exists", async () => {
    const mockPrisma = {
      follow: {
        count: vi.fn(async () => 1),
      },
    } as any;
    const result = await checkUserFollowing(mockPrisma, "user-1", "ap-001");
    expect(result).toBe(true);
  });

  it("returns false when no Follow records exist", async () => {
    const mockPrisma = {
      follow: {
        count: vi.fn(async () => 0),
      },
    } as any;
    const result = await checkUserFollowing(mockPrisma, "user-1", "ap-001");
    expect(result).toBe(false);
  });

  it("returns false when userId is null (guest)", async () => {
    const mockPrisma = {
      follow: {
        count: vi.fn(async () => 1),
      },
    } as any;
    const result = await checkUserFollowing(mockPrisma, null, "ap-001");
    expect(result).toBe(false);
  });
});

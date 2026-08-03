/**
 * STORY-profile-004: Unit tests for the listener profile service.
 *
 * Covers:
 *  - Public playlist filtering (only isPublic=true playlists returned)
 *  - Playlist mapping (title, trackCount, coverImageUrl)
 *  - Followed artists mapping (stageName, avatarUrl, isVerified)
 *  - Registration year computed from User.createdAt
 *  - avatarUrl from User.artistProfile relation
 *  - Guest request handling (no authenticated user)
 *  - User not found returns 404
 *  - Empty listener (no playlists, no followed artists) returns empty arrays
 *  - mapPublicPlaylists, mapFollowedArtists, mapListenerProfileToResponse helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getListenerPublicProfile,
  mapPublicPlaylists,
  mapFollowedArtists,
  mapListenerProfileToResponse,
  LISTENER_PROFILE_ERRORS,
  type PublicPlaylistEntry,
  type FollowedArtistSummary,
} from "./listenerProfile";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const TEST_JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";

/**
 * Create a minimal Prisma mock for listener profile queries.
 */
function createMockPrisma(
  user?: Record<string, unknown>,
  publicPlaylists: Record<string, unknown>[] = [],
  follows: Record<string, unknown>[] = [],
  privatePlaylists: Record<string, unknown>[] = [],
) {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(async ({ where, include }) => {
        if (!user) return null;
        const result: Record<string, unknown> = { ...user };
        if (include?.playlists) {
          result.playlists = publicPlaylists.filter(
            (pl) => pl.userId === where.id && pl.isPublic === true,
          );
        }
        if (include?.followsAsFollower) {
          result.followsAsFollower = follows;
        }
        if (include?.artistProfile) {
          result.artistProfile = user.artistProfile;
        }
        return result;
      }),
    },
    artistProfile: {
      findUnique: vi.fn(async () => null),
    },
    playlist: {
      findMany: vi.fn(async ({ where }) => {
        return publicPlaylists.filter(
          (pl) => pl.userId === where.userId && pl.isPublic === where.isPublic,
        );
      }),
    },
    follow: {
      findMany: vi.fn(async ({ where }) => {
        return follows.filter((f) => f.followerId === where.followerId);
      }),
    },
  };
  return mockPrisma as unknown as any;
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
/*  Tests: mapPublicPlaylists                                         */
/* ------------------------------------------------------------------ */

describe("mapPublicPlaylists", () => {
  it("maps playlist records to PublicPlaylistEntry", () => {
    const playlists = [
      {
        id: "pl-1",
        title: "My Favorites",
        trackCount: 10,
        coverImageUrl: "https://example.com/cover1.jpg",
      },
      {
        id: "pl-2",
        title: "Chill Vibes",
        trackCount: 5,
        coverImageUrl: null,
      },
    ];
    const result = mapPublicPlaylists(playlists as any);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "pl-1",
      title: "My Favorites",
      trackCount: 10,
      coverImageUrl: "https://example.com/cover1.jpg",
    });
    expect(result[1].coverImageUrl).toBeNull();
  });

  it("defaults trackCount to 0 when missing", () => {
    const playlists = [
      { id: "pl-1", title: "Empty", coverImageUrl: null },
    ];
    const result = mapPublicPlaylists(playlists as any);
    expect(result[0].trackCount).toBe(0);
  });

  it("returns empty array when no playlists exist", () => {
    const result = mapPublicPlaylists([]);
    expect(result).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: mapFollowedArtists                                         */
/* ------------------------------------------------------------------ */

describe("mapFollowedArtists", () => {
  it("maps Follow records with artist relations to summaries", () => {
    const follows = [
      {
        id: "f-1",
        followerId: "user-1",
        artistProfileId: "ap-1",
        artist: {
          id: "ap-1",
          stageName: "IndieArtist",
          avatarUrl: "https://example.com/avatar.jpg",
          isVerified: true,
        },
      },
      {
        id: "f-2",
        followerId: "user-1",
        artistProfileId: "ap-2",
        artist: {
          id: "ap-2",
          stageName: "BedroomPop",
          avatarUrl: null,
          isVerified: false,
        },
      },
    ];
    const result = mapFollowedArtists(follows as any, "user-1");
    expect(result).toHaveLength(2);
    expect(result[0].stageName).toBe("IndieArtist");
    expect(result[0].isVerified).toBe(true);
    expect(result[1].avatarUrl).toBeNull();
  });

  it("filters out null artists", () => {
    const follows = [
      { id: "f-1", followerId: "user-1", artist: null },
    ];
    const result = mapFollowedArtists(follows as any, "user-1");
    expect(result).toHaveLength(0);
  });

  it("defaults avatarUrl and isVerified when missing", () => {
    const follows = [
      {
        id: "f-1",
        followerId: "user-1",
        artist: { id: "ap-1", stageName: "Unknown" },
      },
    ];
    const result = mapFollowedArtists(follows as any, "user-1");
    expect(result[0].avatarUrl).toBeNull();
    expect(result[0].isVerified).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: mapListenerProfileToResponse                               */
/* ------------------------------------------------------------------ */

describe("mapListenerProfileToResponse", () => {
  it("maps User fields with artistProfile avatar and registration year", () => {
    const user = {
      id: "user-1",
      displayName: "CoolUser",
      createdAt: new Date("2022-06-15"),
      artistProfile: {
        avatarUrl: "https://example.com/avatar.jpg",
      },
    };
    const playlists: PublicPlaylistEntry[] = [
      { id: "pl-1", title: "Favorites", trackCount: 5, coverImageUrl: null },
    ];
    const artists: FollowedArtistSummary[] = [
      { id: "ap-1", stageName: "ArtistX", avatarUrl: null, isVerified: true },
    ];

    const result = mapListenerProfileToResponse(user as any, playlists, artists);

    expect(result.id).toBe("user-1");
    expect(result.username).toBe("CoolUser");
    expect(result.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(result.registrationYear).toBe(2022);
    expect(result.playlists).toHaveLength(1);
    expect(result.followedArtists).toHaveLength(1);
    expect(result.followedArtists[0].stageName).toBe("ArtistX");
  });

  it("defaults registrationYear to 0 when createdAt is missing", () => {
    const user = {
      id: "user-1",
      displayName: "NoDate",
      artistProfile: null,
    };
    const result = mapListenerProfileToResponse(
      user as any,
      [],
      [],
    );
    expect(result.registrationYear).toBe(0);
  });

  it("handles missing artistProfile avatar gracefully", () => {
    const user = {
      id: "user-1",
      displayName: "NoAvatar",
      createdAt: new Date("2023-01-01"),
      artistProfile: null,
    };
    const result = mapListenerProfileToResponse(user as any, [], []);
    expect(result.avatarUrl).toBeNull();
    expect(result.username).toBe("NoAvatar");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: getListenerPublicProfile — guest requests                  */
/* ------------------------------------------------------------------ */

describe("getListenerPublicProfile — guest requests", () => {
  it("returns public profile without requiring authentication", async () => {
    const user = {
      id: "user-1",
      displayName: "GuestUser",
      createdAt: new Date("2021-03-10"),
      artistProfile: {
        avatarUrl: "https://example.com/avatar.jpg",
      },
    };
    const mockPrisma = createMockPrisma(user, [], [], []);

    const result = await getListenerPublicProfile(mockPrisma, "user-1", null);
    expect(result.success).toBe(true);
    expect(result.data!.profile.username).toBe("GuestUser");
    expect(result.data!.profile.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(result.data!.profile.registrationYear).toBe(2021);
    expect(result.data!.profile.playlists).toHaveLength(0);
    expect(result.data!.profile.followedArtists).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: getListenerPublicProfile — authenticated requests          */
/* ------------------------------------------------------------------ */

describe("getListenerPublicProfile — authenticated requests", () => {
  it("returns public profile with playlists and followed artists for authenticated user", async () => {
    const user = {
      id: "user-1",
      displayName: "AuthUser",
      createdAt: new Date("2020-07-20"),
      artistProfile: {
        avatarUrl: "https://example.com/auth-avatar.jpg",
      },
    };
    const publicPlaylists = [
      {
        id: "pl-1",
        userId: "user-1",
        isPublic: true,
        title: "Workout Mix",
        trackCount: 20,
        coverImageUrl: "https://example.com/workout.jpg",
      },
      {
        id: "pl-2",
        userId: "user-1",
        isPublic: false,
        title: "Private List",
        trackCount: 3,
        coverImageUrl: "https://example.com/private.jpg",
      },
    ];
    const follows = [
      {
        id: "f-1",
        followerId: "user-1",
        artistProfileId: "ap-1",
        artist: {
          id: "ap-1",
          stageName: "RockStar",
          avatarUrl: "https://example.com/rock.jpg",
          isVerified: true,
          tracks: [],
        },
      },
    ];

    const mockPrisma = createMockPrisma(
      user,
      publicPlaylists as any,
      follows,
      [],
    );

    const session = { userId: "user-1" } as any;
    const result = await getListenerPublicProfile(mockPrisma, "user-1", session);
    expect(result.success).toBe(true);
    expect(result.data!.profile.username).toBe("AuthUser");
    // Private playlist should NOT appear
    expect(result.data!.profile.playlists).toHaveLength(1);
    expect(result.data!.profile.playlists[0].title).toBe("Workout Mix");
    expect(result.data!.profile.playlists[0].trackCount).toBe(20);
    // Followed artist should appear
    expect(result.data!.profile.followedArtists).toHaveLength(1);
    expect(result.data!.profile.followedArtists[0].stageName).toBe("RockStar");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Private playlist filtering                                 */
/* ------------------------------------------------------------------ */

describe("getListenerPublicProfile — private playlist filtering", () => {
  it("excludes private playlists from the result", async () => {
    const user = {
      id: "user-2",
      displayName: "PrivateUser",
      createdAt: new Date("2023-11-01"),
      artistProfile: {
        avatarUrl: "https://example.com/u2-avatar.jpg",
      },
    };
    const publicPlaylists = [
      {
        id: "pl-public",
        userId: "user-2",
        isPublic: true,
        title: "Public Collection",
        trackCount: 15,
        coverImageUrl: "https://example.com/public.jpg",
      },
    ];
    const privatePlaylists = [
      {
        id: "pl-private",
        userId: "user-2",
        isPublic: false,
        title: "Secret List",
        trackCount: 1,
        coverImageUrl: "https://example.com/secret.jpg",
      },
    ];
    const mockPrisma = createMockPrisma(
      user,
      publicPlaylists as any,
      [],
      privatePlaylists,
    );

    const result = await getListenerPublicProfile(mockPrisma, "user-2", null);
    expect(result.success).toBe(true);
    expect(result.data!.profile.playlists).toHaveLength(1);
    expect(result.data!.profile.playlists[0].title).toBe("Public Collection");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: User Not Found                                             */
/* ------------------------------------------------------------------ */

describe("getListenerPublicProfile — user not found", () => {
  it("returns 404 when user does not exist", async () => {
    const mockPrisma = createMockPrisma(undefined, [], [], []);

    const result = await getListenerPublicProfile(mockPrisma, "nonexistent", null);
    expect(result.success).toBe(false);
    expect(result.code).toBe(LISTENER_PROFILE_ERRORS.NOT_FOUND);
    expect(result.status).toBe(404);
    expect(result.message).toContain("nonexistent");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Empty Listener Profile                                     */
/* ------------------------------------------------------------------ */

describe("getListenerPublicProfile — empty listener", () => {
  it("returns zeroed data for listener with no playlists or follows", async () => {
    const user = {
      id: "user-3",
      displayName: "NewUser",
      createdAt: new Date("2024-01-15"),
      artistProfile: {
        avatarUrl: null,
      },
    };
    const mockPrisma = createMockPrisma(user, [], [], []);

    const result = await getListenerPublicProfile(mockPrisma, "user-3", null);
    expect(result.success).toBe(true);
    expect(result.data!.profile.username).toBe("NewUser");
    expect(result.data!.profile.registrationYear).toBe(2024);
    expect(result.data!.profile.avatarUrl).toBeNull();
    expect(result.data!.profile.playlists).toHaveLength(0);
    expect(result.data!.profile.followedArtists).toHaveLength(0);
  });
});

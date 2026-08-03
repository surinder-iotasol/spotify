/**
 * STORY-profile-001: Artist Profile Service
 *
 * Provides public artist profile fetching with aggregated metrics:
 * - Total plays (sum of LIVE track playCounts)
 * - Total likes (sum of LIVE track likeCounts)
 * - Follower count (from ArtistProfile)
 * - Top 5 popular tracks (LIVE, ordered by playCount desc)
 *
 * Accessible to both authenticated and unauthenticated (guest) users.
 * When authenticated, includes isFollowing boolean based on Follow records.
 */

import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Error codes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Artist profile-specific error codes.
 */
export const ARTIST_PROFILE_ERRORS = {
  NOT_FOUND: "ARTIST_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Session or null (for guest requests).
 */
export type MaybeSession = { userId: string } | null;

/**
 * Aggregated metrics computed from the artist's tracks and profile.
 */
export interface AggregatedMetrics {
  totalPlays: number;
  totalLikes: number;
  followerCount: number;
}

/**
 * Top track entry for the popular tracks list.
 */
export interface TopTrack {
  id: string;
  title: string;
  genre: string;
  playCount: number;
  likeCount: number;
  status: string;
  coverImageUrl: string | null;
}

/**
 * Public artist profile returned in API responses.
 */
export interface ArtistPublicProfileResponse {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  headerImageUrl: string | null;
  socialLinks: unknown[] | null;
  isVerified: boolean;
  isFollowing: boolean;
}

/**
 * Full API response shape for GET /artists/:artistId.
 */
export interface ArtistProfileApiResult {
  profile: ArtistPublicProfileResponse;
  metrics: AggregatedMetrics;
  topTracks: TopTrack[];
}

/**
 * Minimal prisma-like interface for the service layer.
 */
export interface PrismaLike {
  artistProfile: {
    findUnique: (args: {
      where: { id: string };
      include?: { tracks?: boolean };
    }) => Promise<Record<string, unknown> | null>;
  };
  follow: {
    count: (args: { where: { userId: string; artistProfileId: string } }) => Promise<number>;
  };
}

/* ------------------------------------------------------------------ */
/*  Service: aggregation helpers                                      */
/* ------------------------------------------------------------------ */

/**
 * Compute aggregated metrics from the artist's LIVE tracks and profile.
 *
 * @param tracks - The artist's tracks (already filtered).
 * @param profile - The ArtistProfile record for followerCount.
 * @returns AggregatedMetrics with totalPlays, totalLikes, followerCount.
 */
export function computeAggregatedMetrics(
  tracks: Array<Record<string, unknown>>,
  profile?: Record<string, unknown>,
): AggregatedMetrics {
  const liveTracks = tracks.filter(
    (t) => (t.status as string) === "LIVE",
  );

  const totalPlays = liveTracks.reduce(
    (sum, t) => sum + ((t.playCount as number) ?? 0),
    0,
  );

  const totalLikes = liveTracks.reduce(
    (sum, t) => sum + ((t.likeCount as number) ?? 0),
    0,
  );

  const followerCount = (profile?.followerCount as number) ?? 0;

  return { totalPlays, totalLikes, followerCount };
}

/**
 * Get top 5 popular LIVE tracks ordered by playCount descending.
 *
 * @param tracks - All tracks owned by the artist.
 * @returns Top 5 LIVE tracks sorted by playCount descending.
 */
export function getTopTracks(
  tracks: Array<Record<string, unknown>>,
): TopTrack[] {
  return tracks
    .filter((t) => (t.status as string) === "LIVE")
    .sort(
      (a, b) => ((b.playCount as number) ?? 0) - ((a.playCount as number) ?? 0),
    )
    .slice(0, 5)
    .map((t) => ({
      id: t.id as string,
      title: t.title as string,
      genre: t.genre as string,
      playCount: (t.playCount as number) ?? 0,
      likeCount: (t.likeCount as number) ?? 0,
      status: t.status as string,
      coverImageUrl: (t.coverImageUrl as string) ?? null,
    }));
}

/* ------------------------------------------------------------------ */
/*  Service: isFollowing check                                        */
/* ------------------------------------------------------------------ */

/**
 * Check if an authenticated user follows a given artist profile.
 *
 * @param prisma - PrismaClient instance (can be injected for testing).
 * @param userId - The authenticated user's ID, or null for guests.
 * @param artistProfileId - The artist profile ID to check.
 * @returns true if the user follows the artist, false otherwise.
 */
export async function checkUserFollowing(
  prisma: PrismaLike,
  userId: string | null,
  artistProfileId: string,
): Promise<boolean> {
  if (!userId) return false;
  const count = await prisma.follow.count({
    where: { userId, artistProfileId },
  });
  return count > 0;
}

/* ------------------------------------------------------------------ */
/*  Service: map profile to response                                  */
/* ------------------------------------------------------------------ */

/**
 * Map a Prisma ArtistProfile record (with relations) to the public
 * profile response shape.
 *
 * @param profile - The ArtistProfile record from Prisma.
 * @param isFollowing - Whether the current user follows this artist.
 * @returns ArtistPublicProfileResponse.
 */
export function mapArtistProfileToResponse(
  profile: Record<string, unknown>,
  isFollowing: boolean,
): ArtistPublicProfileResponse {
  return {
    id: profile.id as string,
    displayName: profile.stageName as string,
    bio: (profile.bio as string) ?? null,
    avatarUrl: (profile.avatarUrl as string) ?? null,
    headerImageUrl: (profile.headerImageUrl as string) ?? null,
    socialLinks: (profile.socialLinks as unknown[]) ?? null,
    isVerified: (profile.isVerified as boolean) ?? false,
    isFollowing,
  };
}

/* ------------------------------------------------------------------ */
/*  Service: main entry point                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch a public artist profile with aggregated metrics.
 *
 * @param prisma - PrismaClient instance (can be injected for testing).
 * @param artistProfileId - MongoDB ObjectId string of the artist profile.
 * @param session - Authenticated session (userId), or null for guests.
 * @returns API-compatible success/error result.
 */
export async function getArtistPublicProfile(
  prisma: PrismaLike,
  artistProfileId: string,
  session: MaybeSession,
): Promise<{
  success: boolean;
  data?: ArtistProfileApiResult;
  code?: string;
  message?: string;
  status: number;
}> {
  // Fetch the artist profile with their tracks
  const profile = await prisma.artistProfile.findUnique({
    where: { id: artistProfileId },
    include: {
      tracks: true,
    },
  });

  if (!profile) {
    return {
      success: false,
      code: ARTIST_PROFILE_ERRORS.NOT_FOUND,
      message: `Artist profile with id '${artistProfileId}' not found.`,
      status: 404,
    };
  }

  // Check if the authenticated user follows this artist
  const isFollowing = await checkUserFollowing(
    prisma,
    session?.userId ?? null,
    artistProfileId,
  );

  // Map profile to public response shape
  const publicProfile = mapArtistProfileToResponse(profile, isFollowing);

  // Compute aggregated metrics from LIVE tracks
  const metrics = computeAggregatedMetrics(
    (profile.tracks as Record<string, unknown>[]) ?? [],
    profile,
  );

  // Get top 5 popular tracks
  const topTracks = getTopTracks((profile.tracks as Record<string, unknown>[]) ?? []);

  return {
    success: true,
    data: {
      profile: publicProfile,
      metrics,
      topTracks,
    },
    status: 200,
  };
}

/* ------------------------------------------------------------------ */
/*  Route handler: GET /api/v1/artists/:artistId                      */
/* ------------------------------------------------------------------ */

/**
 * GET /api/v1/artists/:artistId
 *
 * Returns public artist profile with aggregated metrics.
 * Accessible to unauthenticated guests (DEC-005).
 */
export async function GET(request: {
  url: string;
  headers: { get: (name: string) => string | null };
  params: Promise<Record<string, string>>;
}): Promise<Response> {
  // Dynamically import prisma here to avoid loading it during tests
  const { default: prismaModule } = await import("@/lib/prisma");
  const { verifySession } = await import("@/lib/auth");

  const url = new URL(request.url);
  const artistProfileId = url.pathname.split("/").pop();

  if (!artistProfileId) {
    return new Response(
      JSON.stringify(
        apiErrorResponse("BAD_REQUEST", "Artist ID is required."),
      ),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Extract session (may be null for guests)
  const cookie = request.headers.get("cookie") ?? "";
  const session = verifySession(cookie);

  // Fetch the profile
  const result = await getArtistPublicProfile(prismaModule, artistProfileId, session);

  if (!result.success) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          result.code ?? "INTERNAL_ERROR",
          result.message ?? "An error occurred.",
        ),
      ),
      { status: result.status, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify(apiSuccessResponse(result.data)),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * STORY-profile-004: Listener Public Profile Service
 *
 * Provides public listener profile fetching with:
 * - Basic user metadata: displayName, avatarUrl, registration year from createdAt
 * - Public playlists grid (isPublic=true): title, trackCount, coverImageUrl
 * - Followed artists: ArtistProfile summary objects with stageName, avatarUrl, isVerified
 *
 * Accessible to both authenticated and unauthenticated (guest) users per DEC-005.
 * When authenticated, returns isFollowing for each followed artist.
 */

import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Error codes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Listener profile-specific error codes.
 */
export const LISTENER_PROFILE_ERRORS = {
  NOT_FOUND: "USER_NOT_FOUND",
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
 * Public playlist entry for the playlists grid.
 */
export interface PublicPlaylistEntry {
  id: string;
  title: string;
  trackCount: number;
  coverImageUrl: string | null;
}

/**
 * Followed artist summary for the followed artists list.
 */
export interface FollowedArtistSummary {
  id: string;
  stageName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

/**
 * Public listener profile returned in API responses.
 */
export interface ListenerPublicProfileResponse {
  id: string;
  username: string;
  avatarUrl: string | null;
  registrationYear: number;
  playlists: PublicPlaylistEntry[];
  followedArtists: FollowedArtistSummary[];
}

/**
 * Full API response shape for GET /users/:userId.
 */
export interface ListenerProfileApiResult {
  profile: ListenerPublicProfileResponse;
}

/* ------------------------------------------------------------------ */
/*  Service: playlist mapping                                         */
/* ------------------------------------------------------------------ */

/**
 * Map a user's public playlists to the grid entry shape.
 *
 * @param playlists - All playlists owned by the user (already filtered isPublic=true).
 * @returns Array of PublicPlaylistEntry.
 */
export function mapPublicPlaylists(
  playlists: Array<Record<string, unknown>>,
): PublicPlaylistEntry[] {
  return playlists.map((pl) => ({
    id: pl.id as string,
    title: pl.title as string,
    trackCount: (pl.trackCount as number) ?? 0,
    coverImageUrl: (pl.coverImageUrl as string) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/*  Service: followed artists mapping                                 */
/* ------------------------------------------------------------------ */

/**
 * Map Follow records with ArtistProfile data to summary objects.
 *
 * @param follows - Follow records with artist relations already included.
 * @param _sessionUserId - ID of the current session user (unused for public profile).
 * @returns Array of FollowedArtistSummary.
 */
export function mapFollowedArtists(
  follows: Array<Record<string, unknown>>,
  _sessionUserId: string | null,
): FollowedArtistSummary[] {
  const results: FollowedArtistSummary[] = [];

  for (const follow of follows) {
    const artist = follow.artist;
    if (!artist || typeof artist !== "object") continue;

    const artistRecord = artist as Record<string, unknown>;

    results.push({
      id: (artistRecord.id as string) ?? "",
      stageName: (artistRecord.stageName as string) ?? "",
      avatarUrl: (artistRecord.avatarUrl as string | null) ?? null,
      isVerified: (artistRecord.isVerified as boolean) ?? false,
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Service: map user to response                                     */
/* ------------------------------------------------------------------ */

/**
 * Map a Prisma User record to the public listener profile response shape.
 *
 * @param user - The User record from Prisma.
 * @param publicPlaylists - The user's public playlists.
 * @param followedArtists - The user's followed artist summaries.
 * @returns ListenerPublicProfileResponse.
 */
export function mapListenerProfileToResponse(
  user: Record<string, unknown>,
  publicPlaylists: PublicPlaylistEntry[],
  followedArtists: FollowedArtistSummary[],
): ListenerPublicProfileResponse {
  const createdAt = user.createdAt as string | Date | undefined;
  let registrationYear = 0;

  if (createdAt) {
    const date = new Date(createdAt);
    if (!isNaN(date.getFullYear())) {
      registrationYear = date.getFullYear();
    }
  }

  // Access avatarUrl from artistProfile relation
  const rawArtistProfile = user.artistProfile;
  const avatarUrl =
    rawArtistProfile && typeof rawArtistProfile === "object"
      ? ((rawArtistProfile as Record<string, unknown>).avatarUrl as string | null)
      : null;

  return {
    id: (user.id as string) ?? "",
    username: (user.displayName as string) ?? "",
    avatarUrl,
    registrationYear,
    playlists: publicPlaylists,
    followedArtists,
  };
}

/* ------------------------------------------------------------------ */
/*  Service: main entry point                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch a public listener profile with public playlists and followed artists.
 *
 * @param prisma - PrismaClient instance (can be injected for testing).
 * @param userId - MongoDB ObjectId string of the target user.
 * @param session - Authenticated session (userId), or null for guests.
 * @returns API-compatible success/error result.
 */
export async function getListenerPublicProfile(
  prisma: {
    user: {
      findUnique: (args: {
        where: { id: string };
        include?: Record<string, unknown>;
      }) => Promise<Record<string, unknown> | null>;
    };
  },
  userId: string,
  session: MaybeSession,
): Promise<{
  success: boolean;
  data?: ListenerProfileApiResult;
  code?: string;
  message?: string;
  status: number;
}> {
  // Fetch the user with public playlists and follow relationships
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      playlists: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
      },
      followsAsFollower: {
        include: {
          artist: {
            include: {
              tracks: true,
            },
          },
        },
      },
      artistProfile: true,
    },
  });

  if (!user) {
    return {
      success: false,
      code: LISTENER_PROFILE_ERRORS.NOT_FOUND,
      message: `User with id '${userId}' not found.`,
      status: 404,
    };
  }

  // Map public playlists
  const publicPlaylists = mapPublicPlaylists(
    (user.playlists as Record<string, unknown>[]) ?? [],
  );

  // Map followed artists
  const followedArtists = mapFollowedArtists(
    (user.followsAsFollower as Record<string, unknown>[]) ?? [],
    session?.userId ?? null,
  );

  // Map to public response
  const profile = mapListenerProfileToResponse(user, publicPlaylists, followedArtists);

  return {
    success: true,
    data: {
      profile,
    },
    status: 200,
  };
}

/* ------------------------------------------------------------------ */
/*  Route handler: GET /api/v1/users/:userId                          */
/* ------------------------------------------------------------------ */

/**
 * GET /api/v1/users/:userId
 *
 * Returns public listener profile with public playlists and followed artists.
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
  const userId = url.pathname.split("/").pop();

  if (!userId) {
    return new Response(
      JSON.stringify(
        apiErrorResponse("BAD_REQUEST", "User ID is required."),
      ),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Extract session (may be null for guests per DEC-005)
  const cookie = request.headers.get("cookie") ?? "";
  const session = verifySession(cookie);

  // Fetch the public profile
  const result = await getListenerPublicProfile(prismaModule, userId, session);

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

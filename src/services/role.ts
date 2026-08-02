/**
 * STORY-role-001: Listener to Artist role upgrade service.
 *
 * - Validates that the user currently has LISTENER role.
 * - Atomically appends ARTIST to User.roles via a Prisma transaction.
 * - Creates a linked ArtistProfile with default stageName fallback.
 * - Returns updated User, ArtistProfile, and a fresh JWT.
 */

import { z } from "zod";
import {
  generateToken,
  buildSetCookieHeader,
  SESSION_COOKIE_NAME,
  type UserRole,
} from "@/lib/auth";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import type { ValidationErrorDetail } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Validation schema                                                  */
/* ------------------------------------------------------------------ */

/**
 * Upgrade input schema.
 * - stageName: optional, trimmed if provided (default: User.displayName).
 * - bio: optional string, max 1000 chars.
 * - genreTags: optional string array.
 */
export const upgradeToArtistSchema = z.object({
  stageName: z.string().min(1).max(80).transform((v) => v.trim()).optional(),
  bio: z.string().max(1000).optional(),
  genreTags: z.array(z.string()).optional(),
});

/** Input type after schema transformation. */
export interface UpgradeInput {
  stageName?: string;
  bio?: string;
  genreTags?: string[];
}

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Upgrade-to-artist-specific error codes.
 */
export const UPGRADE_ERRORS = {
  ALREADY_ARTIST: "ALREADY_ARTIST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/* ------------------------------------------------------------------ */
/*  Upgrade result                                                     */
/* ------------------------------------------------------------------ */

/**
 * Return type for `upgradeToArtist`.
 */
export interface UpgradeResult {
  success: boolean;
  status: number;
  code: string;
  message: string;
  user: Record<string, unknown> | null;
  artistProfile: Record<string, unknown> | null;
  cookie: string | null;
  details?: ValidationErrorDetail[];
}

/* ------------------------------------------------------------------ */
/*  Service function                                                   */
/* ------------------------------------------------------------------ */

/**
 * Upgrade a Listener user to Artist role.
 * Executes an atomic Prisma transaction to:
 *  1. Append 'ARTIST' to User.roles.
 *  2. Create a linked ArtistProfile record.
 *
 * @param prisma     - PrismaClient instance (injected for testability).
 * @param userId     - The authenticated user's ID.
 * @param userRoles  - Current roles of the user (for pre-check).
 * @param displayName - User's display name (used for stageName fallback).
 * @param input      - Validated upgrade payload.
 * @returns UpgradeResult with status code, updated user, artist profile, and cookie.
 */
export async function upgradeToArtist(
  prisma: {
    $transaction: (
      fn: (tx: {
        user: {
          update: (args: {
            where: { id: string };
            data: { roles: { set: string[] } };
          }) => Promise<unknown>;
        };
        artistProfile: {
          create: (args: {
            data: {
              userId: string;
              stageName: string;
              bio?: string;
              genreTags?: unknown;
              followerCount: number;
              trackCount: number;
            };
          }) => Promise<unknown>;
        };
      }) => Promise<{ user: unknown; artistProfile: unknown }>,
      options?: { timeout?: number; maxWait?: number },
    ) => Promise<{ user: unknown; artistProfile: unknown }>;
  },
  userId: string,
  userRoles: string[],
  displayName: string,
  input: UpgradeInput,
): Promise<UpgradeResult> {
  // 0. Check if user already has ARTIST role
  if (userRoles.includes("ARTIST")) {
    return {
      success: false,
      status: 409,
      code: UPGRADE_ERRORS.ALREADY_ARTIST,
      message: "User already has the ARTIST role.",
      user: null,
      artistProfile: null,
      cookie: null,
    };
  }

  try {
    // Default stageName falls back to displayName (computed before transaction for use in response)
    const stageName = (input.stageName ?? displayName).trim();

    // 1. Atomic transaction: update roles + create ArtistProfile
    const result = await prisma.$transaction(
      async (tx) => {
        // Append ARTIST to existing roles (preserves LISTENER)
        const updatedRoles = [...userRoles, "ARTIST"];

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { roles: { set: updatedRoles } },
        });

        const artistProfile = await tx.artistProfile.create({
          data: {
            userId,
            stageName,
            bio: input.bio,
            genreTags: input.genreTags ?? null,
            followerCount: 0,
            trackCount: 0,
          },
        });

        return { user: updatedUser, artistProfile };
      },
      { timeout: 10_000 },
    );

    // 2. Extract results
    const { user: updatedUser, artistProfile: newProfile } = result;

    // 3. Build the top-level role for JWT (ARTIST is now the highest)
    const jwtRole: UserRole = "ARTIST";

    // 4. Generate fresh JWT with revised role claims
    const token = generateToken({
      sub: userId,
      role: jwtRole,
      artistProfileId: (newProfile as Record<string, unknown>)?.id as
        | string
        | undefined,
    });

    const cookie = buildSetCookieHeader(token);

    // 5. Build sanitized response objects
    const sanitizedUser = {
      id: (updatedUser as Record<string, unknown>).id,
      email: (updatedUser as Record<string, unknown>).email,
      displayName: displayName,
      roles: (updatedUser as Record<string, unknown>).roles,
      status: (updatedUser as Record<string, unknown>).status,
      emailVerified: (updatedUser as Record<string, unknown>).emailVerified,
      createdAt: (updatedUser as Record<string, unknown>).createdAt,
      updatedAt: (updatedUser as Record<string, unknown>).updatedAt,
    };

    const sanitizedProfile = {
      id: (newProfile as Record<string, unknown>).id,
      userId,
      stageName,
      bio: input.bio ?? null,
      genreTags: input.genreTags ?? null,
      followerCount: 0,
      trackCount: 0,
      createdAt: (newProfile as Record<string, unknown>).createdAt,
      updatedAt: (newProfile as Record<string, unknown>).updatedAt,
    };

    const topRole: UserRole = "ARTIST";

    const envelope = apiSuccessResponse(
      {
        user: sanitizedUser,
        artistProfile: sanitizedProfile,
      },
      { message: "Successfully upgraded to Artist role." },
    );

    return {
      success: true,
      status: 200,
      code: "UPGRADED",
      message: "Successfully upgraded to Artist role.",
      user: envelope.data.user,
      artistProfile: envelope.data.artistProfile,
      cookie,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    if (
      errMessage.toLowerCase().includes("unique") ||
      errMessage.toLowerCase().includes("duplicate")
    ) {
      return {
        success: false,
        status: 409,
        code: UPGRADE_ERRORS.ALREADY_ARTIST,
        message: "An artist profile already exists for this user.",
        user: null,
        artistProfile: null,
        cookie: null,
      };
    }

    return {
      success: false,
      status: 500,
      code: UPGRADE_ERRORS.INTERNAL_ERROR,
      message: "An internal error occurred during upgrade.",
      user: null,
      artistProfile: null,
      cookie: null,
    };
  }
}

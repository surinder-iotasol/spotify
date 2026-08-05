/**
 * STORY-track-003: POST /api/v1/tracks — Track Registration Endpoint
 *
 * Validates title (1-100 chars), genre (normalized taxonomy), and audioStorageKey
 * presence. Triggers out-of-band audio duration extraction via the metadata service,
 * sets Track.status to LIVE per DEC-001, links cover art (or defaults to genre-based
 * cover), persists the Track document via Prisma, and returns HTTP 201.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";
import {
  createTrack,
  validateTrackInput,
} from "@/services/trackRegistration";
import { KeyNotFoundError } from "@/services/audioMetadata";

/* ------------------------------------------------------------------ */
/*  Request body shape                                                 */
/* ------------------------------------------------------------------ */

interface TrackRegistrationBody {
  title: unknown;
  genre: unknown;
  audioStorageKey: unknown;
  coverImageStorageKey?: unknown;
  description?: unknown;
}

/* ------------------------------------------------------------------ */
/*  Route handler — POST /api/v1/tracks                                */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate via session cookie.
  const session = verifySession(request.headers.get("cookie") ?? "");

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "Authentication required."),
      { status: 401 },
    );
  }

  // 2. Resolve authoritative emailVerified + roles from the database.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { emailVerified: true, roles: true },
  });

  if (!user) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "User not found."),
      { status: 401 },
    );
  }

  // 3. Email verification gate (DEC-004).
  if (!user.emailVerified) {
    return NextResponse.json(
      apiErrorResponse("EMAIL_NOT_VERIFIED", "Email verification is required to upload tracks."),
      { status: 403 },
    );
  }

  // 4. ARTIST role gate — only artists may register tracks.
  if (!user.roles.includes("ARTIST")) {
    return NextResponse.json(
      apiErrorResponse("FORBIDDEN_ROLE", "ARTIST role required to register tracks."),
      { status: 403 },
    );
  }

  // 5. Look up the artist profile for this user.
  const artistProfile = await prisma.artistProfile.findUnique({
    where: { userId: session.userId },
  });

  if (!artistProfile) {
    return NextResponse.json(
      apiErrorResponse("ARTIST_PROFILE_REQUIRED", "You must have an artist profile to register tracks."),
      { status: 403 },
    );
  }

  // 6. Parse request body.
  let body: TrackRegistrationBody;
  try {
    body = (await request.json()) as TrackRegistrationBody;
  } catch {
    return NextResponse.json(
      apiErrorResponse("INVALID_JSON", "Request body must be valid JSON."),
      { status: 400 },
    );
  }

  // 7. Build input for validation.
  const input = {
    title: body.title,
    genre: body.genre,
    artistProfileId: artistProfile.id,
    audioStorageKey: body.audioStorageKey,
    coverImageStorageKey: body.coverImageStorageKey ?? undefined,
    description: body.description ?? undefined,
  };

  // 8. Validate input — title, genre, audioStorageKey.
  const validationErrors = validateTrackInput(input);
  if (validationErrors) {
    return NextResponse.json(
      apiErrorResponse(
        "VALIDATION_ERROR",
        `Track registration validation failed.`,
        validationErrors.details.map((d) => ({
          field: d.field,
          code: d.code,
          message: d.message,
        })),
      ),
      { status: 422 },
    );
  }

  // 9. Call the track registration service.
  try {
    const track = await createTrack(input);

    return NextResponse.json(
      apiSuccessResponse(track),
      { status: 201 },
    );
  } catch (err: unknown) {
    // Handle missing storage key — return HTTP 404.
    if (err instanceof KeyNotFoundError) {
      return NextResponse.json(
        apiErrorResponse(
          "STORAGE_KEY_NOT_FOUND",
          `The audio storage key '${err.key}' does not exist.`,
        ),
        { status: 404 },
      );
    }

    // Handle corrupted audio error from the service layer.
    if (
      err instanceof Error &&
      (err as any).corruptedKey
    ) {
      return NextResponse.json(
        apiErrorResponse(
          "CORRUPTED_AUDIO_FILE",
          "Audio file is corrupted or unreadable.",
        ),
        { status: 422 },
      );
    }

    // Handle validation errors that propagated up.
    if (
      err instanceof Error &&
      (err as any).validationErrors
    ) {
      const validationErrors = (err as any).validationErrors as {
        fields: string[];
        details: Array<{ field: string; code: string; message: string }>;
      };
      return NextResponse.json(
        apiErrorResponse(
          "VALIDATION_ERROR",
          "Track registration validation failed.",
          validationErrors.details,
        ),
        { status: 422 },
      );
    }

    // Catch-all for unexpected errors.
    return NextResponse.json(
      apiErrorResponse("INTERNAL_ERROR", "An unexpected error occurred."),
      { status: 500 },
    );
  }
}

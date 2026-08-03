/**
 * STORY-auth-005: POST /api/v1/playlists
 *
 * Accepts a guest-playlist payload and creates a permanent Playlist record
 * (plus PlaylistTrack junction rows) linked to the authenticated user.
 *
 * This is the client-facing endpoint that consumers call after registration
 * or sign-in to convert draft playlists stored in localStorage into database
 * records.
 *
 * Accepts:
 *   { title, description?, isPublic?, tracks: [{ trackId, position }] }
 *
 * Returns 201 with the created Playlist envelope.
 *
 * HTTP status codes:
 *   201 — playlist created successfully
 *   400 — missing title or tracks
 *   422 — validation failure
 *   401 — unauthenticated (middleware intercepts)
 *   500 — internal server error
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  playlistMigrationSchema,
  type PlaylistMigrationInput,
  createPlaylistFromGuest,
  GUEST_PLAYLIST_MIGRATION_ERRORS,
} from "@/lib/auth/guest-playlist-migration";
import { validateBody } from "@/lib/api/validation";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { sanitisePlaylistTitle, sanitisePlaylistDescription } from "@/lib/auth/guest-session";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // 0. Extract user identity from middleware-injected headers.
  //    The edge middleware validates the session cookie and injects these.
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          GUEST_PLAYLIST_MIGRATION_ERRORS.UNAUTHENTICATED,
          "Authentication is required to create playlists.",
        ),
      ),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 1. Parse and guard body
  const rawBody = await request.json().catch(() => null);
  if (rawBody == null) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          GUEST_PLAYLIST_MIGRATION_ERRORS.INVALID_BODY,
          "Invalid or empty request body.",
        ),
      ),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Validate against migration schema
  const validation = validateBody(rawBody, playlistMigrationSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          GUEST_PLAYLIST_MIGRATION_ERRORS.VALIDATION_FAILED,
          "Request validation failed.",
          validation.errors,
        ),
      ),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const parsed: PlaylistMigrationInput = validation.data!;

  // 3. Sanitise inputs before persisting
  const title = sanitisePlaylistTitle(parsed.title);
  const description = sanitisePlaylistDescription(parsed.description);

  // Validate title is non-empty after sanitisation
  if (title.length === 0) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          GUEST_PLAYLIST_MIGRATION_ERRORS.INVALID_TITLE,
          "Playlist title is required and cannot be empty.",
        ),
      ),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 4. Create the permanent Playlist entity and track junctions
  try {
    const playlist = await createPlaylistFromGuest(
      prisma as unknown as any,
      {
        userId,
        title,
        description,
        isPublic: parsed.isPublic ?? false,
        tracks: parsed.tracks,
      },
    );

    // 5. Return 201 with the created playlist
    const headers = new Headers({ "Content-Type": "application/json" });
    const envelope = apiSuccessResponse(playlist, {
      migratedFrom: "guest",
    });

    return new Response(JSON.stringify(envelope), {
      status: 201,
      headers,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    // Handle duplicate key on track position or trackId within playlist
    if (
      errMessage.toLowerCase().includes("duplicate key") ||
      errMessage.toLowerCase().includes("unique")
    ) {
      return new Response(
        JSON.stringify(
          apiErrorResponse(
            GUEST_PLAYLIST_MIGRATION_ERRORS.DUPLICATE_TRACK,
            "A track with this position or ID already exists in this playlist.",
          ),
        ),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify(
        apiErrorResponse(
          GUEST_PLAYLIST_MIGRATION_ERRORS.INTERNAL_ERROR,
          "Failed to create playlist.",
        ),
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

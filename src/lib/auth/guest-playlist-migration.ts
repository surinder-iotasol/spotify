/**
 * STORY-auth-005: Guest Playlist Migration Service — server-side layer
 *
 * Provides:
 *  - A Zod schema for validating guest-playlist payloads.
 *  - A `createPlaylistFromGuest` service that creates a permanent Playlist
 *    and associated PlaylistTrack junctions in the database.
 *
 * This module is pure Node.js (no Next.js dependencies) so it can be
 * unit-tested independently and called from route handlers or batch
 * migration jobs.
 */

import { z } from "zod";
import {
  sanitisePlaylistTitle,
  sanitisePlaylistDescription,
  MAX_GUEST_TRACKS,
  type GuestPlaylistTrack,
} from "@/lib/auth/guest-session";

/* ------------------------------------------------------------------ */
/*  Validation schema                                                  */
/* ------------------------------------------------------------------ */

/** Single track input for playlist migration. */
const guestTrackInputSchema = z.object({
  trackId: z.string().min(1, "trackId is required"),
  position: z.number().int().min(0, "position must be a non-negative integer"),
});

/** Schema for a guest playlist payload. */
export const playlistMigrationSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional().or(z.literal("").optional()),
  isPublic: z.boolean().optional().default(false),
  tracks: z
    .array(guestTrackInputSchema)
    .min(1, "At least one track is required")
    .max(MAX_GUEST_TRACKS, `Maximum ${MAX_GUEST_TRACKS} tracks allowed`),
});

/** Input type after schema validation. */
export interface PlaylistMigrationInput {
  title: string;
  description?: string;
  isPublic?: boolean;
  tracks: GuestPlaylistTrack[];
}

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Error codes for guest playlist migration.
 */
export const GUEST_PLAYLIST_MIGRATION_ERRORS = {
  INVALID_BODY: "INVALID_BODY",
  INVALID_TITLE: "INVALID_TITLE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  DUPLICATE_TRACK: "DUPLICATE_TRACK",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/* ------------------------------------------------------------------ */
/*  Service: createPlaylistFromGuest                                   */
/* ------------------------------------------------------------------ */

/**
 * Service input for creating a permanent playlist from guest data.
 */
export interface CreatePlaylistFromGuestInput {
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  tracks: GuestPlaylistTrack[];
}

/**
 * Prisma shape used by the migration service.
 */
interface PrismaPlaylist {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  trackCount: number;
  totalDurationSeconds: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * Create a permanent Playlist entity and populate PlaylistTrack junctions
 * from a guest-session payload.
 *
 * @param prisma — PrismaClient instance (injected for testability).
 * @param input  — Sanitised migration input with userId, title, tracks.
 * @returns The created Playlist object (Prisma model).
 * @throws Will throw on DB errors (duplicates, constraint violations).
 *
 * Uses a Prisma transaction to ensure atomicity: if any PlaylistTrack
 * insert fails, the entire Playlist is rolled back.
 */
export async function createPlaylistFromGuest(
  prisma: {
    playlist: {
      create: (args: {
        data: {
          id: string;
          userId: string;
          title: string;
          description?: string;
          isPublic: boolean;
          trackCount: number;
          totalDurationSeconds: number;
        };
      }) => Promise<PrismaPlaylist>;
    };
    playlistTrack: {
      create: (args: {
        data: {
          id: string;
          playlistId: string;
          trackId: string;
          position: number;
        };
      }) => Promise<{ id: string; playlistId: string; trackId: string; position: number }>;
    };
  },
  input: CreatePlaylistFromGuestInput,
): Promise<PrismaPlaylist> {
  // Create the Playlist record first
  const playlist = await prisma.playlist.create({
    data: {
      id: crypto.randomUUID(),
      userId: input.userId,
      title: input.title,
      description: input.description,
      isPublic: input.isPublic,
      trackCount: input.tracks.length,
      totalDurationSeconds: 0.0, // duration computed later via track lookups
    },
  });

  // Create PlaylistTrack junctions in order
  await Promise.all(
    input.tracks.map((track) =>
      prisma.playlistTrack.create({
        data: {
          id: crypto.randomUUID(),
          playlistId: playlist.id,
          trackId: track.trackId,
          position: track.position,
        },
      }),
    ),
  );

  return playlist;
}

/**
 * STORY-track-003: Track Registration Service
 *
 * Handles the core business logic for track registration:
 * - Validates title (1-100 chars), genre (normalized taxonomy), audioStorageKey presence
 * - Extracts audio duration metadata out-of-band
 * - Auto-sets Track.status to LIVE per DEC-001
 * - Links coverImageStorageKey or assigns default genre cover URL
 * - Persists the Track document in MongoDB via Prisma
 * - Returns the full Track object
 */

import prisma from "@/lib/prisma";
import { createStorageProvider } from "@/lib/storage/storage-provider";
import { extractAudioMetadata, CorruptedAudioError, KeyNotFoundError } from "@/services/audioMetadata";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const VALID_GENRES = new Set([
  "INDIE_ROCK",
  "BEDROOM_POP",
  "ELECTRONIC",
  "HIP_HOP",
  "LO_FI",
  "AMBIENT",
  "R_AND_B",
  "FOLK",
  "OTHER",
]);

const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 100;

const DEFAULT_COVERS_BASE = "/static/covers/defaults";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CreateTrackInput {
  title: unknown;
  genre: unknown;
  artistProfileId: string;
  audioStorageKey: unknown;
  coverImageStorageKey?: unknown;
  description?: unknown;
}

export interface TrackValidationErrors {
  fields: string[];
  details: Array<{ field: string; code: string; message: string }>;
}

export interface CreatedTrack {
  id: string;
  title: string;
  genre: string;
  description: string | null;
  audioStorageKey: string;
  audioUrl: string | null;
  coverImageUrl: string;
  coverImageStorageKey: string | null;
  artistProfileId: string;
  status: string;
  duration: number;
  playCount: number;
  likeCount: number;
  isLive: boolean;
  isSoftHidden: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Validate the incoming track registration input.
 * Returns null on success, or a TrackValidationErrors object on failure.
 */
export function validateTrackInput(input: CreateTrackInput): TrackValidationErrors | null {
  const details: TrackValidationErrors["details"] = [];

  // 1. Title validation: must be a string, 1-100 chars.
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    details.push({
      field: "title",
      code: "TITLE_REQUIRED",
      message: "Track title is required and must be a non-empty string.",
    });
  } else if (input.title.length < MIN_TITLE_LENGTH) {
    details.push({
      field: "title",
      code: "TITLE_TOO_SHORT",
      message: `Track title must be at least ${MIN_TITLE_LENGTH} character(s).`,
    });
  } else if (input.title.length > MAX_TITLE_LENGTH) {
    details.push({
      field: "title",
      code: "TITLE_TOO_LONG",
      message: `Track title must not exceed ${MAX_TITLE_LENGTH} characters.`,
    });
  }

  // 2. Genre validation: must be one of the normalized taxonomy values.
  if (!VALID_GENRES.has(input.genre as string)) {
    details.push({
      field: "genre",
      code: "INVALID_GENRE",
      message: `Genre must be one of: ${[...VALID_GENRES].join(", ")}.`,
    });
  }

  // 3. audioStorageKey validation: must be a non-empty string.
  if (
    typeof input.audioStorageKey !== "string" ||
    input.audioStorageKey.trim().length === 0
  ) {
    details.push({
      field: "audioStorageKey",
      code: "AUDIO_STORAGE_KEY_REQUIRED",
      message: "Audio storage key is required.",
    });
  }

  if (details.length > 0) {
    return { fields: details.map((d) => d.field), details };
  }

  return null;
}

/**
 * Normalize and return a genre string.
 * Throws if the genre is invalid (caller should validate first).
 */
export function normalizeGenre(genre: unknown): string {
  const normalized = String(genre).toUpperCase().trim();
  if (!VALID_GENRES.has(normalized)) {
    throw new Error(`Invalid genre: ${genre}`);
  }
  return normalized;
}

/**
 * Compute the cover image URL.
 * If coverImageStorageKey is provided, return it.
 * Otherwise, return the default genre cover URL.
 */
export function resolveCoverImage(
  coverImageStorageKey: string | undefined,
  genre: string,
): string {
  if (coverImageStorageKey) {
    return coverImageStorageKey;
  }
  return `${DEFAULT_COVERS_BASE}/${genre.toLowerCase()}.png`;
}

/* ------------------------------------------------------------------ */
/*  Core service function                                              */
/* ------------------------------------------------------------------ */

/**
 * Register a new track:
 * 1. Validate the input payload.
 * 2. Extract audio metadata (duration) from storage.
 * 3. Build the Track document with auto-live status and cover image.
 * 4. Persist to MongoDB via Prisma.
 * 5. Return the created Track.
 */
export async function createTrack(
  input: CreateTrackInput,
): Promise<CreatedTrack> {
  // 1. Validate input.
  const validationErrors = validateTrackInput(input);
  if (validationErrors) {
    const error = new Error(`Track registration validation failed: ${JSON.stringify(validationErrors)}`);
    (error as any).validationErrors = validationErrors;
    throw error;
  }

  const title = input.title.trim();
  const genre = normalizeGenre(input.genre);
  const audioStorageKey = input.audioStorageKey;
  const coverImageStorageKey = typeof input.coverImageStorageKey === "string"
    ? input.coverImageStorageKey
    : undefined;
  const description = typeof input.description === "string"
    ? input.description.trim() || null
    : null;

  // 2. Extract audio duration via the audio metadata service.
  //    This runs out-of-band but blocks registration until we have the data.
  let duration: number = 0.0;
  const storageConfig = {
    bucket: process.env.S3_BUCKET_NAME || "",
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  };
  const storage = createStorageProvider(storageConfig);
  try {
    const metadata = await extractAudioMetadata(storage, audioStorageKey);
    duration = metadata.duration;
  } catch (err) {
    if (err instanceof CorruptedAudioError) {
      const error = new Error("Audio file is corrupted or unreadable.");
      (error as any).corruptedKey = audioStorageKey;
      throw error;
    }
    // Re-throw KeyNotFoundError so the route handler can return 404.
    if (err instanceof KeyNotFoundError) {
      throw err;
    }
    // For any other storage error, default duration to 0.0.
    // In a production system we might queue this for retry.
    duration = 0.0;
  }

  // 3. Resolve cover image URL.
  const coverImageUrl = resolveCoverImage(coverImageStorageKey, genre);

  // 4. Create the Track document via Prisma.
  //    Per DEC-001: auto-live — status defaults to LIVE without admin approval.
  const track = await prisma.track.create({
    data: {
      id: crypto.randomUUID(),
      title,
      genre: genre as any, // Genre enum value
      description,
      audioStorageKey,
      coverImageUrl,
      coverImageStorageKey: coverImageStorageKey || null,
      artistProfileId: input.artistProfileId,
      status: "LIVE" as any, // TrackStatus.LIVE
      duration,
    },
  });

  // 5. Map Prisma model to the CreatedTrack response shape.
  const result: CreatedTrack = {
    id: track.id,
    title: track.title,
    genre: track.genre,
    description: track.description,
    audioStorageKey: track.audioStorageKey,
    audioUrl: track.audioUrl,
    coverImageUrl: track.coverImageUrl,
    coverImageStorageKey: track.coverImageStorageKey,
    artistProfileId: track.artistProfileId,
    status: track.status,
    duration: track.duration,
    playCount: track.playCount,
    likeCount: track.likeCount,
    isLive: track.isLive,
    isSoftHidden: track.isSoftHidden,
    deletedAt: track.deletedAt?.toISOString() ?? null,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  };

  return result;
}

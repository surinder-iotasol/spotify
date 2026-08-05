/**
 * STORY-track-005d: Track Registration Error Recovery Handlers
 *
 * Extracted error recovery logic from trackRegistration.ts and the route handler.
 * Provides functions to:
 * - Clean up orphaned storage objects on registration failure
 * - Generate standardized error envelopes for 422 (corrupted audio) and 404 (key not found)
 */

import { KeyNotFoundError, CorruptedAudioError } from "@/services/audioMetadata";
import { createStorageProvider, type StorageProvider } from "@/lib/storage/storage-provider";
import { apiErrorResponse } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Output of the error envelope generation helpers — status code + response body. */
export interface ErrorEnvelope {
  status: number;
  body: unknown;
}

/** Cleanup context: storage keys that may need deletion on failure. */
export interface CleanupContext {
  audioStorageKey: string;
  coverImageStorageKey?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_AWS_REGION = "us-east-1";

/* ------------------------------------------------------------------ */
/*  Cleanup helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Attempt to delete orphaned storage objects after a registration failure.
 *
 * Both audioStorageKey and coverImageStorageKey are cleaned up.
 * Deletion failures are silently tolerated per the acceptance criteria
 * ("deleteObject calls on missing keys are tolerated (no unhandled errors)").
 */
export async function cleanupOrphanedStorage(
  cleanupContext: CleanupContext,
): Promise<void> {
  const storageConfig = {
    bucket: process.env.S3_BUCKET_NAME || "",
    region: process.env.AWS_REGION || DEFAULT_AWS_REGION,
    endpoint: process.env.S3_ENDPOINT || "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  };
  const storage = createStorageProvider(storageConfig);

  // Always clean up the audio key (the one that caused the failure).
  await safeDelete(storage, cleanupContext.audioStorageKey);

  // Clean up the cover image key if it was assigned/created.
  if (cleanupContext.coverImageStorageKey) {
    await safeDelete(storage, cleanupContext.coverImageStorageKey);
  }
}

/**
 * Delete a single storage object, swallowing all errors so callers
 * never see unhandled rejections from a cleanup step.
 */
async function safeDelete(storage: StorageProvider, key: string): Promise<void> {
  try {
    await storage.deleteObject(key);
  } catch {
    // Tolerate missing / already-deleted keys — the object is gone.
  }
}

/* ------------------------------------------------------------------ */
/*  Error envelope generators                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate a 422 error envelope for corrupted audio files.
 *
 * @param audioKey — The storage key of the corrupted file (includes in message).
 * @returns ErrorEnvelope with status 422 and CORRUPTED_AUDIO_FILE code.
 */
export function generateCorruptedAudioEnvelope(audioKey: string): ErrorEnvelope {
  return {
    status: 422,
    body: apiErrorResponse(
      "CORRUPTED_AUDIO_FILE",
      `Audio file is corrupted or unreadable.`,
    ),
  };
}

/**
 * Generate a 404 error envelope for missing storage keys.
 *
 * @param key — The storage key that was not found.
 * @returns ErrorEnvelope with status 404 and STORAGE_KEY_NOT_FOUND code.
 */
export function generateKeyNotFoundEnvelope(key: string): ErrorEnvelope {
  return {
    status: 404,
    body: apiErrorResponse(
      "STORAGE_KEY_NOT_FOUND",
      `The audio storage key '${key}' was not found.`,
    ),
  };
}

/* ------------------------------------------------------------------ */
/*  Unified error handler                                              */
/* ------------------------------------------------------------------ */

/**
 * Handle an error that occurred during track registration.
 *
 * 1. Tries to clean up any orphaned storage objects.
 * 2. Maps the error type to the correct HTTP status + envelope.
 * 3. Returns the ErrorEnvelope for the route handler.
 *
 * This is the core function tested by STORY-track-005d unit tests.
 */
export async function handleRegistrationError(
  error: unknown,
  cleanupContext: CleanupContext,
): Promise<ErrorEnvelope> {
  // Always attempt cleanup before returning the error envelope.
  await cleanupOrphanedStorage(cleanupContext);

  // Determine error type → envelope.
  if (error instanceof CorruptedAudioError) {
    const audioKey = (error as any).storageKey || cleanupContext.audioStorageKey;
    return generateCorruptedAudioEnvelope(audioKey);
  }

  if (error instanceof KeyNotFoundError) {
    return generateKeyNotFoundEnvelope(error.key ?? cleanupContext.audioStorageKey);
  }

  // Re-wrap other errors with the cleanup context for the generic path.
  return {
    status: 500,
    body: apiErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred during track registration.",
    ),
  };
}

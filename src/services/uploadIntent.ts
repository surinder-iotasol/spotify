/**
 * STORY-track-001: Upload Intent Service
 *
 * Handles validation and presigned URL generation for track audio and cover
 * image uploads. Called by the POST /api/v1/tracks/upload-intent endpoint.
 */

import { createStorageProvider, type StorageProviderConfig } from "@/lib/storage/storage-provider";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_AUDIO_SIZE = 52_428_800;          // 50 MB
const MAX_COVER_SIZE = 5 * 1024 * 1024;     // 5 MB
const UPLOAD_TTL = 900;                      // 15 minutes (seconds)

const ALLOWED_AUDIO_MIMES = new Set(["audio/mpeg", "audio/wav"]);
const ALLOWED_COVER_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const AUDIO_EXTENSIONS = new Map<string, string>([
  ["audio/mpeg", ".mp3"],
  ["audio/wav", ".wav"],
]);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Input from the upload-intent endpoint. */
export interface UploadIntentInput {
  fileType: "audio" | "cover";
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  artistId: string;
  trackId: string;
  coverFileName?: string;
  coverFileSizeBytes?: number;
  coverMimeType?: string;
}

/** A single validation error. */
export interface ValidationError {
  code: string;
  message: string;
}

/** Union type: success with data or failure with errors. */
export type ValidationResult =
  | { ok: true; data: UploadIntentResult }
  | { ok: false; errors: ValidationError[] };

/** Data returned on a successful upload-intent. */
export interface UploadIntentResult {
  audioUploadUrl: string;
  audioStorageKey: string;
  coverImageUploadUrl?: string;
  coverImageStorageKey?: string;
  expiresAt: string; // UTC ISO-8601
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Validate an audio file's MIME type and size.
 */
export function validateAudioFile(
  mimeType: string,
  fileSizeBytes: number,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ALLOWED_AUDIO_MIMES.has(mimeType)) {
    errors.push({
      code: "INVALID_AUDIO_MIME_TYPE",
      message: `Audio MIME type "${mimeType}" is not allowed. Allowed: ${[...ALLOWED_AUDIO_MIMES].join(", ")}.`,
    });
  }

  if (fileSizeBytes > MAX_AUDIO_SIZE) {
    errors.push({
      code: "AUDIO_FILE_TOO_LARGE",
      message: `Audio file size (${fileSizeBytes} bytes) exceeds the maximum allowed size of ${MAX_AUDIO_SIZE} bytes (50 MB).`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data: {} as UploadIntentResult };
}

/**
 * Validate a cover image's MIME type and size.
 */
export function validateCoverImage(
  mimeType: string,
  fileSizeBytes: number,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ALLOWED_COVER_MIMES.has(mimeType)) {
    errors.push({
      code: "INVALID_COVER_IMAGE_MIME_TYPE",
      message: `Cover MIME type "${mimeType}" is not allowed. Allowed: ${[...ALLOWED_COVER_MIMES].join(", ")}.`,
    });
  }

  if (fileSizeBytes > MAX_COVER_SIZE) {
    errors.push({
      code: "COVER_IMAGE_FILE_TOO_LARGE",
      message: `Cover image size (${fileSizeBytes} bytes) exceeds the maximum allowed size of ${MAX_COVER_SIZE} bytes (5 MB).`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data: {} as UploadIntentResult };
}

/* ------------------------------------------------------------------ */
/*  Storage key generation                                             */
/* ------------------------------------------------------------------ */

/**
 * Generate a deterministic S3 storage key for a track upload.
 *
 * Audio key format:  audio/{artistId}/{trackId}/{uuid}.{ext}
 * Cover key format:  covers/{artistId}/{trackId}/{uuid}.webp
 */
export function generateStorageKey(
  artistId: string,
  trackId: string,
  fileType: "audio" | "cover",
  mimeType: string,
  uuid: string,
): string {
  if (fileType === "audio") {
    const ext = AUDIO_EXTENSIONS.get(mimeType) ?? ".mp3";
    return `audio/${artistId}/${trackId}/${uuid}${ext}`;
  }
  return `covers/${artistId}/${trackId}/${uuid}.webp`;
}

/* ------------------------------------------------------------------ */
/*  Main service function                                              */
/* ------------------------------------------------------------------ */

/**
 * Generate presigned upload URLs for a track (audio + optional cover).
 *
 * This is the core service logic called by the endpoint. It:
 * 1. Validates audio MIME type and size.
 * 2. Optionally validates cover image MIME type and size.
 * 3. Generates deterministic S3 keys.
 * 4. Issues 15-minute presigned PUT URLs.
 */
export async function generateUploadIntent(
  input: UploadIntentInput,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  // Validate audio
  const audioResult = validateAudioFile(input.mimeType, input.fileSizeBytes);
  if (!audioResult.ok) {
    return { ok: false, errors: audioResult.errors };
  }

  // Validate optional cover image
  if (input.coverMimeType && input.coverFileName && input.coverFileSizeBytes) {
    const coverResult = validateCoverImage(
      input.coverMimeType,
      input.coverFileSizeBytes,
    );
    if (!coverResult.ok) {
      return { ok: false, errors: coverResult.errors };
    }
  }

  // Generate presigned URLs
  const uuid = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL * 1000);

  const storageConfig: StorageProviderConfig = {
    bucket: process.env.S3_BUCKET_NAME || "",
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  };

  const provider = createStorageProvider(storageConfig);

  let audioUploadUrl: string;
  let coverImageUploadUrl: string | undefined;

  try {
    audioUploadUrl = await provider.generatePresignedUploadUrl(
      generateStorageKey(input.artistId, input.trackId, "audio", input.mimeType, uuid),
      { ttl: UPLOAD_TTL, contentType: input.mimeType },
    );

    if (input.coverMimeType && input.coverFileName && input.coverFileSizeBytes) {
      coverImageUploadUrl = await provider.generatePresignedUploadUrl(
        generateStorageKey(input.artistId, input.trackId, "cover", input.coverMimeType, uuid),
        { ttl: UPLOAD_TTL, contentType: input.coverMimeType },
      );
    }
  } catch {
    return {
      ok: false,
      errors: [
        {
          code: "STORAGE_ERROR",
          message: "Failed to generate presigned upload URLs.",
        },
      ],
    };
  }

  return {
    ok: true,
    data: {
      audioUploadUrl,
      audioStorageKey: generateStorageKey(
        input.artistId,
        input.trackId,
        "audio",
        input.mimeType,
        uuid,
      ),
      ...(coverImageUploadUrl
        ? {
            coverImageUploadUrl,
            coverImageStorageKey: generateStorageKey(
              input.artistId,
              input.trackId,
              "cover",
              input.coverMimeType!,
              uuid,
            ),
          }
        : {}),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

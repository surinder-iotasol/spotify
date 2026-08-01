/**
 * STORY-storage-002: Upload validation utilities for file metadata
 * against audio and image size/MIME rules.
 *
 * Provides validation for audio (MP3, WAV up to 50MB) and image
 * (JPEG, PNG, WebP up to 10MB) uploads before returning presigned URLs.
 */

// ── Constants ──────────────────────────────────────────────────────

export const MAX_AUDIO_UPLOAD_SIZE = 52_428_800; // 50 MB
export const MAX_IMAGE_UPLOAD_SIZE = 10_485_760; // 10 MB

export const ALLOWED_AUDIO_MIMES = new Set(['audio/mpeg', 'audio/wav']);
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const AUDIO_FILE_EXTENSIONS = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/wav', '.wav'],
]);

export const IMAGE_FILE_EXTENSION = '.webp';

// ── Interfaces ─────────────────────────────────────────────────────

/**
 * Upload intent input from the client request body.
 */
export interface UploadIntentInput {
  fileType: 'audio' | 'image';
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  artistId: string;
  trackId?: string;
  imageId?: string;
}

/**
 * Validation error returned on failed checks.
 */
export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Presigned upload result returned on success.
 */
export interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number;
}

/**
 * Validation result (union of success and failure).
 */
export type ValidationResult =
  | { ok: true; data: PresignedUploadResult }
  | { ok: false; errors: ValidationError[] };

// ── Validation Logic ───────────────────────────────────────────────

/**
 * Validate file metadata against audio/image rules.
 *
 * Checks:
 * - fileType must be 'audio' or 'image'
 * - mimeType must be in the allowed set for the given fileType
 * - fileSizeBytes must not exceed the configured maximum
 * - fileName must be a non-empty string
 *
 * @param input  - The upload intent input from the client.
 * @returns A union type: success data or validation errors.
 */
export function validateUploadIntent(
  input: UploadIntentInput,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate fileType
  if (input.fileType !== 'audio' && input.fileType !== 'image') {
    errors.push({
      code: 'INVALID_FILE_TYPE',
      message: `Invalid fileType "${input.fileType}". Must be "audio" or "image".`,
    });
  }

  // Validate fileName
  if (!input.fileName || typeof input.fileName !== 'string' || input.fileName.trim().length === 0) {
    errors.push({
      code: 'INVALID_FILE_NAME',
      message: 'fileName is required and must be a non-empty string.',
    });
  }

  // Validate fileSizeBytes
  if (
    input.fileSizeBytes === undefined ||
    input.fileSizeBytes === null ||
    !Number.isFinite(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0
  ) {
    errors.push({
      code: 'INVALID_FILE_SIZE',
      message: 'fileSizeBytes is required and must be a positive number.',
    });
  }

  // Validate mimeType
  if (!input.mimeType || typeof input.mimeType !== 'string') {
    errors.push({
      code: 'INVALID_MIME_TYPE',
      message: 'mimeType is required and must be a non-empty string.',
    });
  }

  // Artist ID required for all uploads
  if (
    !input.artistId ||
    typeof input.artistId !== 'string' ||
    input.artistId.trim().length === 0
  ) {
    errors.push({
      code: 'MISSING_ARTIST_ID',
      message: 'artistId is required for storage uploads.',
    });
  }

  // Per-type checks (only run if fileType is valid)
  if (input.fileType === 'audio') {
    if (!ALLOWED_AUDIO_MIMES.has(input.mimeType)) {
      errors.push({
        code: 'INVALID_AUDIO_MIME_TYPE',
        message: `Audio MIME type "${input.mimeType}" is not allowed. Allowed: ${[...ALLOWED_AUDIO_MIMES].join(', ')}.`,
      });
    }
    if (
      input.fileSizeBytes !== undefined &&
      input.fileSizeBytes !== null &&
      Number.isFinite(input.fileSizeBytes) &&
      input.fileSizeBytes > MAX_AUDIO_UPLOAD_SIZE
    ) {
      errors.push({
        code: 'AUDIO_FILE_TOO_LARGE',
        message: `Audio file size (${input.fileSizeBytes} bytes) exceeds the maximum allowed size of ${MAX_AUDIO_UPLOAD_SIZE} bytes (50 MB).`,
      });
    }
  }

  if (input.fileType === 'image') {
    if (!ALLOWED_IMAGE_MIMES.has(input.mimeType)) {
      errors.push({
        code: 'INVALID_IMAGE_MIME_TYPE',
        message: `Image MIME type "${input.mimeType}" is not allowed. Allowed: ${[...ALLOWED_IMAGE_MIMES].join(', ')}.`,
      });
    }
    if (
      input.fileSizeBytes !== undefined &&
      input.fileSizeBytes !== null &&
      Number.isFinite(input.fileSizeBytes) &&
      input.fileSizeBytes > MAX_IMAGE_UPLOAD_SIZE
    ) {
      errors.push({
        code: 'IMAGE_FILE_TOO_LARGE',
        message: `Image file size (${input.fileSizeBytes} bytes) exceeds the maximum allowed size of ${MAX_IMAGE_UPLOAD_SIZE} bytes (10 MB).`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, data: {} as PresignedUploadResult };
}

// ── Object Key Generation ──────────────────────────────────────────

/**
 * Generate a deterministic object key for an audio upload.
 * Format: audio/{artistId}/{trackId}_{uuid}.mp3
 *
 * @param artistId  - The artist identifier.
 * @param trackId   - The track identifier.
 * @param mimeType  - The MIME type (to determine extension).
 * @param uuid      - UUID for uniqueness.
 * @returns The deterministic storage key.
 */
export function generateAudioObjectKey(
  artistId: string,
  trackId: string,
  mimeType: string,
  uuid: string,
): string {
  const ext = AUDIO_FILE_EXTENSIONS.get(mimeType) ?? '.mp3';
  return `audio/${artistId}/${trackId}_${uuid}${ext}`;
}

/**
 * Generate a deterministic object key for an image upload.
 * Format: images/{artistId}/{imageId}_{uuid}.webp
 *
 * @param artistId  - The artist identifier.
 * @param imageId   - The image identifier.
 * @param uuid      - UUID for uniqueness.
 * @returns The deterministic storage key.
 */
export function generateImageObjectKey(
  artistId: string,
  imageId: string,
  uuid: string,
): string {
  return `images/${artistId}/${imageId}_${uuid}${IMAGE_FILE_EXTENSION}`;
}

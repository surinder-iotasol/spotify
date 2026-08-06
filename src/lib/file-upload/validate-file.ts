/**
 * File upload validation utilities.
 *
 * Validates file type (MP3, WAV) and size (max 50 MB).
 */

const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav'];
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Check if a MIME type is an accepted audio format.
 */
export function isAudioFormat(mimeType: string): boolean {
  return ALLOWED_TYPES.includes(mimeType);
}

/**
 * Validate a single file against allowed type and size constraints.
 */
export function validateFile(file: File): ValidationResult {
  if (!isAudioFormat(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type || 'unknown'}" is not supported. Only MP3 and WAV files are accepted.`,
    };
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the 50 MB limit.`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Get allowed extensions.
 */
export function getAcceptedMimeTypes(): string[] {
  return ALLOWED_TYPES;
}

/**
 * File upload validation utilities.
 *
 * Validates file type (MP3, WAV) and file size (max 50MB).
 * Used by the FileUploadZone component to validate dropped or selected files.
 */

// ── Constants ─────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

const ALLOWED_TYPES = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/wave'];

const ALLOWED_EXTENSIONS = ['mp3', 'wav'];

// ── Types ─────────────────────────────────────────────────────────────────

export interface ValidationResult {
  allowed: boolean;
  fileName: string;
  fileSize: number;
  fileType: string;
  error?: string;
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Check if a MIME type is an allowed audio type.
 */
export function isAllowedFileType(mimeType: string): boolean {
  const cleanType = mimeType.trim().toLowerCase();
  return ALLOWED_TYPES.includes(cleanType);
}

/**
 * Check if a file extension is allowed (case-insensitive).
 */
export function isAllowedExtension(extension: string): boolean {
  const cleanExt = extension.trim().toLowerCase();
  return ALLOWED_EXTENSIONS.includes(cleanExt);
}

/**
 * Derive a human-readable format label from the MIME type.
 */
export function formatTypeLabel(mimeType: string): string {
  const cleanType = mimeType.trim().toLowerCase();
  if (cleanType.includes('mp3') || cleanType === 'audio/mpeg') {
    return 'MP3';
  }
  if (cleanType.includes('wav')) {
    return 'WAV';
  }
  return cleanType || 'Unknown';
}

/**
 * Validate a single file against allowed type and size constraints.
 * Returns a ValidationResult with allowed flag and optional error message.
 */
export function validateFile(file: File): ValidationResult {
  const result: ValidationResult = {
    allowed: false,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    error: undefined,
  };

  // Check MIME type
  if (!file.type) {
    // File has no MIME type — fall back to extension check
    const ext = file.name.split('.').pop() || '';
    if (!isAllowedExtension(ext)) {
      result.error = `"${ext.toUpperCase()}" files are not allowed. Only MP3 and WAV files are accepted.`;
      return result;
    }
  } else if (!isAllowedFileType(file.type)) {
    result.error = `"${formatTypeLabel(file.type)}" files are not allowed. Only MP3 and WAV files are accepted.`;
    return result;
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    result.error = `File size (${sizeMB} MB) exceeds the maximum allowed size of 50 MB.`;
    return result;
  }

  result.allowed = true;
  return result;
}

/**
 * Validate multiple files and return validation results for each.
 */
export function validateFiles(files: File[]): ValidationResult[] {
  return files.map((file) => validateFile(file));
}

/**
 * Validate an array of files and return结果为
 * - allowed: files that passed validation
 * - rejected: files that failed validation
 */
export function splitValidatedFiles(files: File[]): {
  allowed: File[];
  rejected: { file: File; validation: ValidationResult }[];
} {
  const results = validateFiles(files);
  const allowed: File[] = [];
  const rejected: { file: File; validation: ValidationResult }[] = [];

  files.forEach((file, index) => {
    if (results[index].allowed) {
      allowed.push(file);
    } else {
      rejected.push({ file, validation: results[index] });
    }
  });

  return { allowed, rejected };
}

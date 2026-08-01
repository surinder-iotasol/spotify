/**
 * Story-setup-005: Audio upload size constraint validation helper.
 *
 * Validates that audio files do not exceed the maximum upload size.
 */

// Maximum upload size: 50 MB in bytes
export const MAX_AUDIO_UPLOAD_SIZE = 50 * 1024 * 1024; // 52,428,800 bytes

/**
 * Validate that an audio file's size does not exceed the maximum allowed.
 * @param fileSize - The file size in bytes
 * @throws Error if file size exceeds 50 MB
 * @returns true if the file size is within limits
 */
export function validateAudioUploadSize(fileSize: number): boolean {
  if (fileSize > MAX_AUDIO_UPLOAD_SIZE) {
    throw new Error(
      `File size (${formatBytes(fileSize)}) exceeds the maximum allowed size of ${formatBytes(MAX_AUDIO_UPLOAD_SIZE)}`,
    );
  }
  return true;
}

/**
 * Helper to format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

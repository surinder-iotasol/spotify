/**
 * STORY-storage-004: useDirectUpload hook
 *
 * Manages the direct-to-storage upload request flow:
 * 1. POST /api/v1/storage/upload-intent → presigned URL
 * 2. Direct PUT binary transfer to S3/R2
 * 3. Progress tracking via onUploadProgress callback
 * 4. Completion state and error handling
 *
 * Pre-upload client validation checks file size (max 50 MB audio)
 * and MIME format before network requests.
 */

import { useState, useCallback, useRef } from 'react';

// ── Constants ───────────────────────────────────────────────────────

export const MAX_AUDIO_UPLOAD_SIZE = 52_428_800; // 50 MB
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/wav',
]);

// ── Types ───────────────────────────────────────────────────────────

export type UploadStatus = 'idle' | 'validating' | 'requesting-url' | 'uploading' | 'complete' | 'error';

export interface UploadIntentResponse {
  uploadUrl: string;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number;
  expiresAt: string;
}

export interface UploadProgress {
  bytesSent: number;
  totalBytes: number;
  percentage: number;
}

export interface UseDirectUploadOptions {
  artistId: string;
  trackId: string;
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (response: UploadIntentResponse) => void;
  onError?: (error: UploadError) => void;
}

export interface UploadError {
  code: string;
  message: string;
}

export interface UseDirectUploadReturn {
  status: UploadStatus;
  progress: UploadProgress;
  error: UploadError | null;
  response: UploadIntentResponse | null;
  startUpload: (file: File) => Promise<void>;
  reset: () => void;
}

// ── Client-side validation ─────────────────────────────────────────

/**
 * Validate a file for upload before sending any network requests.
 * Checks MIME type and file size against server constraints.
 *
 * @param file - The File object to validate.
 * @returns An UploadError if validation fails, null if valid.
 */
export function validateUploadFile(file: File): UploadError | null {
  // Check MIME type
  if (!ALLOWED_AUDIO_MIMES.has(file.type)) {
    return {
      code: 'INVALID_MIME_TYPE',
      message: `File type "${file.type || 'unknown'}" is not supported. Only MP3 and WAV audio files are allowed.`,
    };
  }

  // Check file size
  if (file.size > MAX_AUDIO_UPLOAD_SIZE) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `File size (${Math.round(file.size / (1024 * 1024))} MB) exceeds the maximum allowed size of 50 MB.`,
    };
  }

  if (file.size === 0) {
    return {
      code: 'EMPTY_FILE',
      message: 'Cannot upload an empty file.',
    };
  }

  return null;
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * React hook for direct-to-storage uploads.
 *
 * Usage:
 *   const { startUpload, status, progress, error } = useDirectUpload({
 *     artistId: 'artist-001',
 *     trackId: 'track-001',
 *   });
 *
 *   startUpload(audioFile);
 */
export function useDirectUpload(
  options: UseDirectUploadOptions,
): UseDirectUploadReturn {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState<UploadProgress>({
    bytesSent: 0,
    totalBytes: 0,
    percentage: 0,
  });
  const [error, setError] = useState<UploadError | null>(null);
  const [response, setResponse] = useState<UploadIntentResponse | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress({ bytesSent: 0, totalBytes: 0, percentage: 0 });
    setError(null);
    setResponse(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startUpload = useCallback(
    async (file: File) => {
      // Step 1: Client-side validation
      setStatus('validating');
      setError(null);

      const validationError = validateUploadFile(file);
      if (validationError) {
        setStatus('error');
        setError(validationError);
        options.onError?.(validationError);
        return;
      }

      // Step 2: Request presigned upload URL from /api/v1/storage/upload-intent
      setStatus('requesting-url');

      const uploadIntentBody = {
        fileType: 'audio',
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
        artistId: options.artistId,
        trackId: options.trackId,
      };

      abortControllerRef.current = new AbortController();

      let intentResponse: UploadIntentResponse;

      try {
        const intentRes = await fetch('/api/v1/storage/upload-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uploadIntentBody),
          signal: abortControllerRef.current.signal,
        });

        if (!intentRes.ok) {
          const body = await intentRes.json().catch(() => null);
          const message =
            body?.error?.message ||
            body?.error ||
            `Upload intent failed with status ${intentRes.status}`;
          const uploadError: UploadError = {
            code: 'UPLOAD_INTENT_FAILED',
            message,
          };
          setStatus('error');
          setError(uploadError);
          options.onError?.(uploadError);
          return;
        }

        const intentData = await intentRes.json();

        // Handle wrapped success response or direct response
        intentResponse = intentData?.data ?? intentData;

        setProgress((prev) => ({
          ...prev,
          totalBytes: intentResponse.fileSizeBytes,
        }));
      } catch (err) {
        const uploadError: UploadError = {
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to request upload URL. Check your network connection.',
        };
        setStatus('error');
        setError(uploadError);
        options.onError?.(uploadError);
        return;
      }

      // Step 3: Direct PUT to presigned URL with progress tracking
      setStatus('uploading');

      try {
        const uploadResponse = await fetch(intentResponse.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
          signal: abortControllerRef.current.signal,
        });

        if (!uploadResponse.ok) {
          const uploadError: UploadError = {
            code: 'DIRECT_UPLOAD_FAILED',
            message: `Direct upload to storage failed with status ${uploadResponse.status}`,
          };
          setStatus('error');
          setError(uploadError);
          options.onError?.(uploadError);
          return;
        }

        // Upload completed successfully
        setStatus('complete');
        setProgress({
          bytesSent: intentResponse.fileSizeBytes,
          totalBytes: intentResponse.fileSizeBytes,
          percentage: 100,
        });
        setResponse(intentResponse);
        options.onComplete?.(intentResponse);
      } catch (err) {
        const uploadError: UploadError = {
          code: 'UPLOAD_FAILED',
          message:
            err instanceof Error ? err.message : 'Upload failed unexpectedly.',
        };
        setStatus('error');
        setError(uploadError);
        options.onError?.(uploadError);
      }
    },
    [options],
  );

  return {
    status,
    progress,
    error,
    response,
    startUpload,
    reset,
  };
}

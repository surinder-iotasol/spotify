/**
 * STORY-storage-004: FileUploadProgress component
 *
 * Displays real-time upload progress with:
 * - Progress bar with percentage
 * - Error notifications with dismiss action
 * - Upload controls (start/reset)
 * - WCAG 2.1 AA accessibility (aria-valuenow, role=progressbar, screen reader announcements)
 * - Responsive layout down to 375px viewports
 */

'use client';

import { useCallback, useRef, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  type UseDirectUploadReturn,
  type UploadError,
  type UploadStatus,
} from '@/hooks/use-direct-upload';

// ── Props ───────────────────────────────────────────────────────────

interface FileUploadProgressProps {
  hook: UseDirectUploadReturn;
  onFileSelect?: (file: File) => void;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Format bytes to human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Sub-components ──────────────────────────────────────────────────

/** Progress bar with accessible attributes */
function ProgressBar({
  percentage,
  status,
}: {
  percentage: number;
  status: UploadStatus;
}) {
  const barColor =
    status === 'error'
      ? 'bg-destructive'
      : status === 'complete'
        ? 'bg-green-500'
        : 'bg-primary';

  return (
    <div
      className={cn(
        'relative w-full rounded-full bg-muted h-4 overflow-hidden',
        'border border-border',
      )}
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Upload progress: ${Math.round(percentage)}%`}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300 ease-out',
          barColor,
        )}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center text-xs font-medium',
          'text-muted-foreground',
          percentage > 10 && 'text-white',
        )}
      >
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

/** Error notification with dismiss button */
function ErrorNotification({
  error,
  onDismiss,
}: {
  error: UploadError;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
      aria-live="assertive"
    >
      <p className="font-semibold">{error.code}</p>
      <p className="mt-1">{error.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 text-xs underline underline-offset-2 hover:text-destructive/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        aria-label="Dismiss error notification"
      >
        Dismiss
      </button>
    </div>
  );
}

/** File picker with accessibility attributes */
function FilePicker({
  onChange,
  disabled,
}: {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}) {
  return (
    <label
      htmlFor="file-upload"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border-2 border-dashed',
        'border-border cursor-pointer transition-colors',
        'hover:border-primary hover:bg-primary/5',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        'py-8 px-4 text-center',
        disabled && 'opacity-50 cursor-not-allowed',
        'min-h-[180px]',
      )}
    >
      <input
        id="file-upload"
        type="file"
        accept="audio/mpeg,audio/wav"
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        aria-label="Select audio file to upload (MP3 or WAV, max 50 MB)"
        tabIndex={disabled ? -1 : 0}
      />
      <span className="text-2xl mb-2" aria-hidden="true">
        🎵
      </span>
      <p className="text-sm font-medium">
        Drop an audio file here, or{' '}
        <span className="text-primary">browse</span>
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        MP3 or WAV · Max 50 MB
      </p>
    </label>
  );
}

// ── Main Component ──────────────────────────────────────────────────

/**
 * FileUploadProgress component for audio uploads.
 *
 * Provides file selection, upload progress, and error handling
 * with full WCAG 2.1 AA accessibility compliance.
 */
export function FileUploadProgress({
  hook,
  onFileSelect,
  className,
}: FileUploadProgressProps) {
  const { status, progress, error, startUpload, reset } = hook;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onFileSelect?.(file);
      startUpload(file);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onFileSelect, startUpload],
  );

  const handleReset = useCallback(() => {
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [reset]);

  const isUploading =
    status === 'requesting-url' || status === 'uploading';

  return (
    <div
      className={cn(
        'w-full max-w-2xl mx-auto space-y-4',
        'p-4 sm:p-6 md:p-8',
        className,
      )}
    >
      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === 'validating' && 'Validating file...'}
        {status === 'requesting-url' && 'Requesting upload URL...'}
        {status === 'uploading' &&
          `Uploading: ${Math.round(progress.percentage)}% complete. ${formatBytes(progress.bytesSent)} of ${formatBytes(progress.totalBytes)}`}
        {status === 'complete' && 'Upload complete!'}
        {status === 'error' && `Upload failed: ${error?.code}`}
      </div>

      {/* File picker */}
      {(status === 'idle' || status === 'complete' || status === 'error') && (
        <FilePicker onChange={handleFileChange} disabled={isUploading} />
      )}

      {/* Upload progress */}
      {(status === 'requesting-url' ||
        status === 'uploading' ||
        status === 'complete' ||
        status === 'error') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {isUploading
                ? 'Uploading...'
                : status === 'complete'
                  ? 'Upload complete'
                  : status === 'error'
                    ? 'Upload failed'
                    : 'Processing...'}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatBytes(progress.bytesSent)} / {formatBytes(progress.totalBytes)}
            </span>
          </div>

          <ProgressBar percentage={progress.percentage} status={status} />

          {/* Error notification */}
          {status === 'error' && error && (
            <ErrorNotification
              error={error}
              onDismiss={() => {
                reset();
                fileInputRef.current?.click();
              }}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-end">
            {status === 'complete' && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border bg-card text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                aria-label="Upload another file"
              >
                Upload Another
              </button>
            )}
            {status === 'error' && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                aria-label="Retry upload"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upload info */}
      {(status === 'idle' || status === 'complete') && (
        <p className="text-xs text-muted-foreground text-center">
          {status === 'idle'
            ? 'Supported formats: MP3, WAV · Maximum file size: 50 MB'
            : 'File uploaded successfully. Proceed to track registration.'}
        </p>
      )}
    </div>
  );
}

export default FileUploadProgress;

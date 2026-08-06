/**
 * STORY-track-006b: UploadZone — drag-and-drop upload zone.
 *
 * - Accepts MP3 and WAV audio files only.
 * - Enforces max 50 MB upload size.
 * - Shows a styled drop zone with hover state.
 * - Displays accepted file preview (name + size).
 * - Shows visible rejection messages for invalid files.
 *
 * Exports:
 *   - UploadZoneProps with onFilesAccepted and onFilesRejected callbacks.
 *   - UploadedFile description interface.
 */
'use client';

import { useCallback, useState, useRef } from 'react';
import { Plus, X, Music, AlertTriangle } from 'lucide-react';
import { validateFile, MAX_UPLOAD_SIZE } from './validation';

// ── Types ───────────────────────────────────────────────────────────────

/** Description of a validated and accepted file. */
export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
}

/** A file that was rejected by the upload zone. */
export interface RejectedFile {
  file: File;
  name: string;
  size: number;
  reason: string;
}

export interface UploadZoneProps {
  /** Called with files that passed validation. */
  onFilesAccepted?: (files: UploadedFile[]) => void;
  /** Called with files that failed validation. */
  onFilesRejected?: (files: RejectedFile[]) => void;
  /** Maximum accepted size; defaults to 50 MB. */
  maxSize?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Format a byte count into human-readable size string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Component ───────────────────────────────────────────────────────────

export function UploadZone({
  onFilesAccepted,
  onFilesRejected,
  maxSize = MAX_UPLOAD_SIZE,
}: UploadZoneProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [acceptedFiles, setAcceptedFiles] = useState<UploadedFile[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (rawFiles: FileList | File[]) => {
      const uploaded: UploadedFile[] = [];
      const rejected: RejectedFile[] = [];

      for (const file of Array.from(rawFiles)) {
        const result = validateFile(file);

        if (result.valid) {
          uploaded.push({
            file,
            name: file.name,
            size: file.size,
            type: file.type ?? '',
          });
        } else {
          rejected.push({
            file,
            name: file.name,
            size: file.size,
            reason: result.error ?? 'Invalid file',
          });
        }
      }

      if (uploaded.length > 0) {
        setAcceptedFiles((prev) => [...prev, ...uploaded]);
        onFilesAccepted?.(uploaded);
      }

      if (rejected.length > 0) {
        setRejectedFiles((prev) => [...prev, ...rejected]);
        onFilesRejected?.(rejected);
      }
    },
    [maxSize, onFilesAccepted, onFilesRejected],
  );

  // ── Drag handlers ──────────────────────────────────────────────────────

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const { files } = e.dataTransfer;
      if (files && files.length > 0) handleFiles(files);
    },
    [handleFiles],
  );

  // ── File input handler ─────────────────────────────────────────────────

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) handleFiles(files);
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFiles],
  );

  // ── Remove accepted file ───────────────────────────────────────────────

  const removeAccepted = useCallback((idx: number) => {
    setAcceptedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const removeRejected = useCallback((idx: number) => {
    setRejectedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Render helpers ─────────────────────────────────────────────────────

  const buttonLabel = 'Upload a Track';

  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop audio files here or click to browse"
        aria-disabled={false}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={
          'relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ' +
          (isDragging
            ? 'border-primary bg-primary/10'
            : 'border-muted-foreground/30 hover:border-primary')
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/wav,.mp3,.wav"
          multiple
          onChange={onInputChange}
          className="hidden"
          aria-hidden="true"
        />

        <div
          className={
            'flex h-14 w-14 items-center justify-center rounded-full transition-colors ' +
            (isDragging ? 'bg-primary/20' : 'bg-muted')
          }
        >
          <Plus className="h-7 w-7 text-muted-foreground" />
        </div>

        <p className="text-sm font-medium text-foreground">
          Drop audio files here or{' '}
          <span className="text-primary underline">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          MP3 or WAV &middot; Maximum {formatBytes(maxSize)}
        </p>
      </div>

      {/* Accepted files list */}
      {acceptedFiles.length > 0 && (
        <div className="space-y-2">
          {acceptedFiles.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-3"
              role="listitem"
              aria-label={`Accepted: ${f.name}`}
            >
              <div className="flex items-center gap-3">
                <Music className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {f.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.size)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAccepted(idx)}
                aria-label={`Remove ${f.name}`}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Rejected files list */}
      {rejectedFiles.length > 0 && (
        <div className="space-y-2">
          {rejectedFiles.map((f, idx) => (
            <div
              key={`rejected-${f.name}-${idx}`}
              className="flex items-center justify-between rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3"
              role="alert"
              aria-live="polite"
              aria-label={`Rejected: ${f.name}`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-500">
                    {f.name}
                  </p>
                  <p className="text-xs text-red-400">{f.reason}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeRejected(idx)}
                aria-label={`Dismiss ${f.name}`}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default UploadZone;

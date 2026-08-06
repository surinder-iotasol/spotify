"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { validateFile, MAX_UPLOAD_SIZE } from "@/lib/file-upload/validate-file";

export interface DragAndDropUploadZoneProps {
  files: File[];
  errors: string[];
  setFiles: (files: File[]) => void;
  setErrors: (errors: string[]) => void;
  className?: string;
}

function processDroppedFiles(
  files: FileList,
  currentErrors: string[],
): { toAdd: File[]; toSetErrors: string[] } {
  const toAdd: File[] = [];
  const toSetErrors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = validateFile(file);
    if (result.valid) {
      toAdd.push(file);
    } else {
      toSetErrors.push(result.error ?? "Unknown error");
    }
  }
  return { toAdd, toSetErrors };
}

export function DragAndDropUploadZone({
  files,
  errors,
  setFiles,
  setErrors,
  className,
}: DragAndDropUploadZoneProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const dt = e.dataTransfer;
      const droppedFiles = dt?.files ?? (e as unknown as { _files?: File[] })._files;
      if (!droppedFiles || droppedFiles.length === 0) return;
      const { toAdd, toSetErrors } = processDroppedFiles(droppedFiles, errors);
      if (toAdd.length > 0) {
        setFiles([...files, ...toAdd]);
      }
      if (toSetErrors.length > 0) {
        setErrors([...errors, ...toSetErrors]);
      }
    },
    [files, errors, setFiles, setErrors],
  );

  const handleDragOver = useCallback(() => {
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/30 p-8 flex flex-col items-center justify-center transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5",
          dragOver && "border-primary bg-primary/10",
          className,
        )}
      >
        <svg
          className="w-12 h-12 text-muted-foreground mb-2 inline-block"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-base font-medium text-foreground mb-1">
          Drag &amp; drop your audio files here
        </p>
        <p className="text-xs text-muted-foreground text-center">
          Accepts MP3 and WAV files, max {MAX_UPLOAD_SIZE / (1024 * 1024)} MB each
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1" role="list">
          {files.map((f, idx) => (
            <li key={idx} className="text-sm text-foreground truncate flex items-center gap-2">
              <span className="text-green-500">{"&#10003;"}</span>
              <span>{f.name}</span>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1" role="list" aria-live="polite">
          {errors.map((err, idx) => (
            <li key={idx} className="text-sm text-red-500 truncate flex items-center gap-2">
              <span className="text-red-400">{"&#10007;"}</span>
              <span>{err}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

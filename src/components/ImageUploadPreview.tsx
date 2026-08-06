/**
 * STORY-profile-007: Image upload preview with crop ratios
 *
 * Provides a file input with drag-and-drop support, image preview with
 * aspect-ratio overlay (1:1 for avatar, 16:9 for header banner), and
 * 5MB file size validation.
 */

import * as React from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ImageUploadType = "avatar" | "header";

export interface ImageUploadState {
  file: File | null;
  previewUrl: string | null;
  error: string | null;
  isLoading: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Validate a file against size and MIME type constraints.
 * Returns an error message or null if valid.
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return "Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${mb}MB). Maximum size is 5MB.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Custom Hook: useImageUpload                                        */
/* ------------------------------------------------------------------ */

/**
 * Hook managing image upload state for avatar/header.
 * Handles file selection, preview generation, validation, and cleanup.
 */
export function useImageUpload(type: ImageUploadType) {
  const [state, setState] = React.useState<ImageUploadState>({
    file: null,
    previewUrl: null,
    error: null,
    isLoading: false,
  });

  const { previewUrl } = state;

  // Cleanup object URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = React.useCallback(
    (file: File) => {
      // Reset error
      setState((prev) => ({ ...prev, error: null }));

      // Validate
      const err = validateImageFile(file);
      if (err) {
        setState((prev) => ({ ...prev, error: err, file: null, previewUrl: null }));
        return;
      }

      // Generate preview URL
      const previewUrl = URL.createObjectURL(file);
      setState({ file, previewUrl, error: null, isLoading: false });
    },
    [],
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileChange(file);
      }
    },
    [handleFileChange],
  );

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const clearImage = React.useCallback(() => {
    setState({ file: null, previewUrl: null, error: null, isLoading: false });
  }, []);

  return {
    ...state,
    handleFileChange,
    handleDrop,
    handleDragOver,
    clearImage,
  };
}

/* ------------------------------------------------------------------ */
/*  ImageUploadPreview Component                                       */
/* ------------------------------------------------------------------ */

interface ImageUploadPreviewProps {
  type: ImageUploadType;
  currentUrl?: string | null;
  onFileSelect: (file: File) => void;
  onClear?: () => void;
}

/**
 * Image upload preview component with crop ratio overlay.
 * Supports drag-and-drop and click-to-browse.
 */
export function ImageUploadPreview({
  type,
  currentUrl,
  onFileSelect,
  onClear,
}: ImageUploadPreviewProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const { previewUrl, error, isLoading } = useImageUpload(type);

  const aspectClass =
    type === "avatar"
      ? "aspect-square"
      : "aspect-[16/9]";

  const displayPreview = previewUrl || currentUrl;

  const handleFileInput = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const label = type === "avatar" ? "Avatar" : "Header Banner";
  const ratio = type === "avatar" ? "1:1" : "16:9";

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">
        {label} ({ratio})
      </label>

      {/* Upload area */}
      <div
        data-testid={`image-upload-${type}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative cursor-pointer rounded-lg border-2 border-dashed transition-colors",
          aspectClass,
          "flex items-center justify-center overflow-hidden",
          isDragOver
            ? "border-blue-400 bg-blue-950/30"
            : "border-gray-600 hover:border-gray-500",
        )}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label} image`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {displayPreview ? (
          <>
            {/* Image preview with crop overlay */}
            <img
              src={displayPreview}
              alt={`${label} preview`}
              className={cn(
                "h-full w-full object-cover",
                type === "avatar" ? "rounded-full" : "",
              )}
            />
            {/* Aspect ratio overlay */}
            <div
              className={cn(
                "absolute inset-0 border-2 border-white/30",
                type === "avatar"
                  ? "rounded-full"
                  : "rounded-lg",
              )}
              aria-hidden="true"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity hover:opacity-100 flex items-center justify-center">
              <span className="text-sm text-white font-medium">Change</span>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400">
            <svg
              className="mx-auto h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-1 text-xs">Drag & drop or click to upload</p>
            <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP, GIF (max 5MB)</p>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Error message */}
      {error && (
        <p data-testid="upload-error" className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {/* Clear button when image exists */}
      {displayPreview && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="text-xs text-gray-400 underline hover:text-gray-300"
        >
          Remove image
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * STORY-track-006c: MetadataEntryForm
 *
 * A client-side form that accepts track metadata (title, genre, description,
 * cover art) and renders live validation errors for each field.
 *
 * Acceptance Criteria:
 * - Title: 1–100 chars, live validation
 * - Genre: populates from platform genre taxonomy
 * - Description: 500-char max, multi-line support
 * - Cover Art: image picker with type/size validation
 */
"use client";

import { useCallback, useState, useRef, type ChangeEvent, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  validateTitle,
  validateDescription,
  validateGenre,
  validateCoverArt,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_COVER_FILE_SIZE,
  GENRE_TAXONOMY,
  type ValidationResult,
} from "@/lib/tracks/metadata-validation";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetadataFormValues {
  title: string;
  genre: string;
  description: string;
  coverImage: File | null;
}

export interface MetadataFormErrors {
  title: string | null;
  genre: string | null;
  description: string | null;
  coverImage: string | null;
}

export interface MetadataFormProps {
  /** Called when all fields are valid; receives the form values. */
  onSubmit: (values: MetadataFormValues) => void;
  /** Button label for the action button. */
  submitLabel?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MetadataEntryForm({ onSubmit, submitLabel = "Next" }: MetadataFormProps) {
  const [values, setValues] = useState<MetadataFormValues>({
    title: "",
    genre: "",
    description: "",
    coverImage: null,
  });
  const [errors, setErrors] = useState<MetadataFormErrors>({
    title: null,
    genre: null,
    description: null,
    coverImage: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── validators (live) ────────────────────────────────────────────────────

  const handleTitleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setValues(prev => ({ ...prev, title }));
    const result = validateTitle(title);
    setErrors(prev => ({ ...prev, title: result.error }));
  }, []);

  const handleGenreChange = useCallback((value: string) => {
    setValues(prev => ({ ...prev, genre: value }));
    const result = validateGenre(value);
    setErrors(prev => ({ ...prev, genre: result.error }));
  }, []);

  const handleDescriptionChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const description = e.target.value;
    setValues(prev => ({ ...prev, description }));
    const result = validateDescription(description);
    setErrors(prev => ({ ...prev, description: result.error }));
  }, []);

  const handleCoverChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setValues(prev => ({ ...prev, coverImage: file }));
    const result = validateCoverArt(file);
    setErrors(prev => ({ ...prev, coverImage: result.error }));
  }, []);

  // ─── form submission ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      const titleErr = validateTitle(values.title).error;
      const genreErr = validateGenre(values.genre).error;
      const descErr = validateDescription(values.description).error;
      const coverErr = validateCoverArt(values.coverImage).error;

      setErrors({ title: titleErr, genre: genreErr, description: descErr, coverImage: coverErr });

      if (titleErr || genreErr || descErr || coverErr) return;

      onSubmit({
        title: values.title.trim(),
        genre: values.genre,
        description: values.description,
        coverImage: values.coverImage,
      });
    },
    [values, onSubmit],
  );

  // ─── render ───────────────────────────────────────────────────────────────

  const titleCount = values.title.length;
  const descCount = values.description.length;
  const coverName = values.coverImage?.name;
  const isCoverValid = !errors.coverImage && values.coverImage !== null && values.coverImage !== undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Title */}
      <div className="space-y-2">
        <label
          htmlFor="metadata-title"
          className="text-sm font-medium text-foreground"
        >
          Title
          <span className="text-muted-foreground font-normal text-xs ml-2">
            ({titleCount}/{MAX_TITLE_LENGTH})
          </span>
        </label>
        <Input
          id="metadata-title"
          name="Title"
          type="text"
          placeholder="Track title"
          value={values.title}
          onChange={handleTitleChange}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined}
          className={errors.title ? "border-destructive" : ""}
        />
        {errors.title && (
          <p id="title-error" className="text-xs text-destructive" role="alert">
            {errors.title}
          </p>
        )}
      </div>

      {/* Genre */}
      <div className="space-y-2">
        <label htmlFor="metadata-genre" className="text-sm font-medium text-foreground">
          Genre
        </label>
        <Select value={values.genre} onValueChange={handleGenreChange} aria-label="Genre">
          <SelectTrigger
            id="metadata-genre"
            name="Genre"
            className={errors.genre ? "border-destructive" : ""}
          >
            <SelectValue placeholder="Select a genre" />
          </SelectTrigger>
          <SelectContent>
            {GENRE_TAXONOMY.map(genre => (
              <SelectItem key={genre.value} value={genre.value}>
                {genre.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.genre && (
          <p className="text-xs text-destructive" role="alert">
            {errors.genre}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label
          htmlFor="metadata-description"
          className="text-sm font-medium text-foreground"
        >
          Description
          <span className="text-muted-foreground font-normal text-xs ml-2">
            ({descCount}/{MAX_DESCRIPTION_LENGTH})
          </span>
        </label>
        <Textarea
          id="metadata-description"
          name="Description"
          rows={4}
          placeholder="Describe your track (optional)"
          value={values.description}
          onChange={handleDescriptionChange}
          className={errors.description ? "border-destructive" : ""}
        />
        {errors.description && (
          <p className="text-xs text-destructive" role="alert">
            {errors.description}
          </p>
        )}
      </div>

      {/* Cover Art */}
      <div className="space-y-2">
        <label
          htmlFor="metadata-cover"
          className="text-sm font-medium text-foreground"
        >
          Cover Art
        </label>
        <input
          ref={fileInputRef}
          id="metadata-cover"
          name="Cover Art"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleCoverChange}
          className="hidden"
          aria-describedby={errors.coverImage ? "cover-error" : undefined}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className={isCoverValid ? "border-green-500 text-green-500" : ""}
        >
          {coverName ? `Selected: ${coverName}` : "Choose image"}
        </Button>
        {values.coverImage != null && (
          <p className="text-xs text-muted-foreground">
            Size: {(values.coverImage.size / (1024 * 1024)).toFixed(1)} MB
            (max {(MAX_COVER_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB)
          </p>
        )}
        {errors.coverImage && (
          <p id="cover-error" className="text-xs text-destructive" role="alert">
            {errors.coverImage}
          </p>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg">
        {submitLabel}
      </Button>
    </form>
  );
}

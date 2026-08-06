/**
 * Track metadata validation utilities.
 *
 * Zod schemas for validating track title, description, genre selection,
 * and cover art image uploads.
 */

import { z } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_TITLE_LENGTH = 100;
export const MIN_TITLE_LENGTH = 1;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const COVER_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'webp'];

// ─── Genre Taxonomy ───────────────────────────────────────────────────────────

/**
 * Platform genre taxonomy — mirrors the Prisma Genre enum at
 * prisma/schema.prisma. Display-friendly labels are provided alongside
 * the normalized string identifiers used by the API.
 */
export const GENRE_TAXONOMY: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'INDIE_ROCK', label: 'Indie Rock' },
  { value: 'BEDROOM_POP', label: 'Bedroom Pop' },
  { value: 'ELECTRONIC', label: 'Electronic' },
  { value: 'HIP_HOP', label: 'Hip Hop' },
  { value: 'LO_FI', label: 'Lo-Fi' },
  { value: 'AMBIENT', label: 'Ambient' },
  { value: 'R_AND_B', label: 'R&B' },
  { value: 'FOLK', label: 'Folk' },
  { value: 'OTHER', label: 'Other' },
];

/** Return all genre values as an array for Zod `.enum()`. */
export function getGenreValues(): string[] {
  return GENRE_TAXONOMY.map(g => g.value);
}

/** Look up a genre label by its value string (reverse lookup). */
export function getGenreLabel(value: string): string | undefined {
  return GENRE_TAXONOMY.find(g => g.value === value)?.label;
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const trackTitleSchema = z
  .string()
  .min(MIN_TITLE_LENGTH, `Title must be at least ${MIN_TITLE_LENGTH} character(s).`)
  .max(MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters.`)
  .trim();

/**
 * Live-validation helper for the title field that returns a structured
 * result (pass / error message) suitable for UI rendering without
 * re-parsing a ZodError.
 */
export function validateTitle(title: string): ValidationResult {
  if (title.trim().length === 0) {
    return { valid: false, error: 'Title is required.' };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return {
      valid: false,
      error: `Title must be at most ${MAX_TITLE_LENGTH} characters.`,
    };
  }
  return { valid: true, error: null };
}

const trackDescriptionSchema = z
  .string()
  .max(MAX_DESCRIPTION_LENGTH,
    `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`);

export function validateDescription(desc: string): ValidationResult {
  if (desc.length > MAX_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      error: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    };
  }
  return { valid: true, error: null };
}

export function validateGenre(genre: string | null | undefined): ValidationResult {
  if (!genre || !getGenreValues().includes(genre)) {
    return { valid: false, error: 'Please select a valid genre.' };
  }
  return { valid: true, error: null };
}

/** Accepted MIME types for cover art. */
export const COVER_ART_MIME_TYPES: ReadonlyArray<string> = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export function validateCoverArt(file: File | null): ValidationResult {
  if (!file) {
    return { valid: false, error: 'Please select a cover image.' };
  }
  if (!COVER_ART_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Only JPEG, PNG, WebP, and GIF images are accepted.',
    };
  }
  if (file.size > MAX_COVER_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Cover image must be at most ${MAX_COVER_FILE_SIZE / (1024 * 1024)} MB (${sizeMb} MB uploaded).`,
    };
  }
  return { valid: true, error: null };
}

// ─── Composite Satellite Form Schema ──────────────────────────────────────────

export const trackMetadataSchema = z.object({
  title: trackTitleSchema,
  genre: z.enum(getGenreValues() as [string, ...string[]]),
  description: trackDescriptionSchema.optional().default(''),
  coverImage: z.unknown().optional(), // File | null, validated separately
});

// ─── Return Types ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export function formatGenreValue(value: string): string {
  return getGenreLabel(value) ?? value;
}

/**
 * STORY-track-006c — Unit tests for track metadata validation utility.
 *
 * Covers title validation, genre taxonomy, description length,
 * and cover art image validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTitle,
  validateDescription,
  validateGenre,
  validateCoverArt,
  MAX_TITLE_LENGTH,
  MIN_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_COVER_FILE_SIZE,
  GENRE_TAXONOMY,
  getGenreValues,
  getGenreLabel,
  formatGenreValue,
  trackMetadataSchema,
} from './metadata-validation';

// ─── Title validation ────────────────────────────────────────────────────────

describe('validateTitle', () => {
  it('rejects empty string', () => {
    const result = validateTitle('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Title is required.');
  });

  it('rejects whitespace-only string', () => {
    const result = validateTitle('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Title is required.');
  });

  it('accepts single character title', () => {
    const result = validateTitle('A');
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('accepts title at minimum length (1)', () => {
    const result = validateTitle('x');
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('accepts title exactly at MAX_TITLE_LENGTH', () => {
    const title = 'a'.repeat(MAX_TITLE_LENGTH);
    const result = validateTitle(title);
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('accepts title within valid range', () => {
    const result = validateTitle('My Awesome Track');
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('rejects title over MAX_TITLE_LENGTH', () => {
    const title = 'a'.repeat(MAX_TITLE_LENGTH + 1);
    const result = validateTitle(title);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      `Title must be at most ${MAX_TITLE_LENGTH} characters.`,
    );
  });

  it('rejects title way over the limit', () => {
    const title = 'a'.repeat(200);
    const result = validateTitle(title);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      `Title must be at most ${MAX_TITLE_LENGTH} characters.`,
    );
  });

  it('trims whitespace before validation', () => {
    const result = validateTitle(' Title ');
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });
});

// ─── Description validation ──────────────────────────────────────────────────

describe('validateDescription', () => {
  it('accepts empty description', () => {
    const result = validateDescription('');
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('accepts description at exactly MAX_DESCRIPTION_LENGTH', () => {
    const desc = 'x'.repeat(MAX_DESCRIPTION_LENGTH);
    const result = validateDescription(desc);
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('accepts description within limit', () => {
    const result = validateDescription('A short description');
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('rejects description over MAX_DESCRIPTION_LENGTH', () => {
    const desc = 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1);
    const result = validateDescription(desc);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  });

  it('accepts multiline description (newlines count as characters)', () => {
    const desc = 'Line one\nLine two\nLine three';
    const result = validateDescription(desc);
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });
});

// ─── Genre validation ────────────────────────────────────────────────────────

describe('validateGenre', () => {
  it('rejects null', () => {
    const result = validateGenre(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please select a valid genre.');
  });

  it('rejects undefined', () => {
    const result = validateGenre(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please select a valid genre.');
  });

  it('rejects empty string', () => {
    const result = validateGenre('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please select a valid genre.');
  });

  it('rejects unknown genre value', () => {
    const result = validateGenre('NONEXISTENT');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please select a valid genre.');
  });

  it('accepts every valid genre from taxonomy', () => {
    const values = getGenreValues();
    expect(values.length).toBeGreaterThanOrEqual(1);
    for (const value of values) {
      const result = validateGenre(value);
      expect(result.valid).toBe(true);
      expect(result.error).toBe(null);
    }
  });

  it('accepts a real genre', () => {
    const result = validateGenre('ELECTRONIC');
    expect(result.valid).toBe(true);
  });
});

describe('getGenreValues', () => {
  it('returns values matching GENRE_TAXONOMY', () => {
    const values = getGenreValues();
    const expected = GENRE_TAXONOMY.map(g => g.value);
    expect(values).toEqual(expected);
  });
});

describe('getGenreLabel', () => {
  it('returns label for known value', () => {
    expect(getGenreLabel('ELECTRONIC')).toBe('Electronic');
    expect(getGenreLabel('HIP_HOP')).toBe('Hip Hop');
  });

  it('returns undefined for unknown value', () => {
    expect(getGenreLabel('UNKNOWN')).toBeUndefined();
  });
});

describe('formatGenreValue', () => {
  it('formats known genre value', () => {
    expect(formatGenreValue('LO_FI')).toBe('Lo-Fi');
    expect(formatGenreValue('R_AND_B')).toBe('R&B');
  });

  it('returns original value when label is unknown', () => {
    expect(formatGenreValue('UNKNOWN')).toBe('UNKNOWN');
  });
});

// ─── Cover art validation ────────────────────────────────────────────────────

describe('validateCoverArt', () => {
  it('rejects null file', () => {
    const result = validateCoverArt(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please select a cover image.');
  });

  it('accepts a valid JPEG File mock', () => {
    const file = new File([], 'cover.jpg', { type: 'image/jpeg' });
    const result = validateCoverArt(file as unknown as File);
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('accepts PNG', () => {
    const file = new File([], 'cover.png', { type: 'image/png' });
    const result = validateCoverArt(file as unknown as File);
    expect(result.valid).toBe(true);
  });

  it('rejects unsupported mime type', () => {
    const file = new File([], 'cover.bmp', { type: 'image/bmp' });
    const result = validateCoverArt(file as unknown as File);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Only JPEG, PNG, WebP, and GIF images are accepted.',
    );
  });

  it('rejects oversized cover image', () => {
    const data = new ArrayBuffer(MAX_COVER_FILE_SIZE + 1);
    const file = new File([data], 'big.jpg', { type: 'image/jpeg' });
    const result = validateCoverArt(file as unknown as File);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('MB');
  });

  it('rejects file with no type (browser GAP type)', () => {
    const file = new File([], 'cover.unknown', { type: '' }) as unknown as File;
    // '' is not in the allowed list
    const result = validateCoverArt(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Only JPEG, PNG, WebP, and GIF images are accepted.',
    );
  });
});

// ─── Genre taxonomy completeness vs Prisma schema ────────────────────────────

describe('GENRE_TAXONOMY completeness', () => {
  it('covers all enum values from Prisma schema', () => {
    const prismaGenres = [
      'INDIE_ROCK',
      'BEDROOM_POP',
      'ELECTRONIC',
      'HIP_HOP',
      'LO_FI',
      'AMBIENT',
      'R_AND_B',
      'FOLK',
      'OTHER',
    ];
    const taxonomyValues = GENRE_TAXONOMY.map(g => g.value);
    for (const genre of prismaGenres) {
      expect(taxonomyValues).toContain(genre);
    }
  });
});

// ─── Composite trackMetadataSchema ────────────────────────────────────────────

describe('trackMetadataSchema', () => {
  it('rejects payload missing title', () => {
    const result = trackMetadataSchema.safeParse({
      genre: 'ELECTRONIC',
      description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid genre', () => {
    const result = trackMetadataSchema.safeParse({
      title: 'My Track',
      genre: 'INVALID_GENRE',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid payload with all fields', () => {
    const result = trackMetadataSchema.safeParse({
      title: 'My awesome track',
      genre: 'HIP_HOP',
      description: 'A description here',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid payload with minimal fields', () => {
    const result = trackMetadataSchema.safeParse({
      title: 'Track',
      genre: 'FOLK',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty description', () => {
    const result = trackMetadataSchema.safeParse({
      title: 'Track',
      genre: 'AMBIENT',
      description: '',
    });
    expect(result.success).toBe(true);
  });
});

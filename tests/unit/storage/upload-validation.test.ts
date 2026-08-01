/**
 * STORY-storage-002: Unit tests for upload validation utilities.
 *
 * Tests cover:
 * - validateUploadIntent: valid and invalid audio payloads
 * - validateUploadIntent: valid and invalid image payloads
 * - validateUploadIntent: general field validation errors
 * - generateAudioObjectKey: deterministic key format
 * - generateImageObjectKey: deterministic key format
 */
import { describe, expect, it } from 'vitest';
import {
  validateUploadIntent,
  generateAudioObjectKey,
  generateImageObjectKey,
  MAX_AUDIO_UPLOAD_SIZE,
  MAX_IMAGE_UPLOAD_SIZE,
  ALLOWED_AUDIO_MIMES,
  ALLOWED_IMAGE_MIMES,
  type UploadIntentInput,
  type ValidationResult,
} from '@/lib/storage/upload-validation';

// ── Helpers ────────────────────────────────────────────────────────

const VALID_AUDIO_INPUT: UploadIntentInput = {
  fileType: 'audio',
  fileName: 'my-track.mp3',
  fileSizeBytes: 5_000_000,
  mimeType: 'audio/mpeg',
  artistId: 'artist-001',
  trackId: 'track-001',
};

const VALID_IMAGE_INPUT: UploadIntentInput = {
  fileType: 'image',
  fileName: 'cover.webp',
  fileSizeBytes: 1_000_000,
  mimeType: 'image/webp',
  artistId: 'artist-001',
  imageId: 'img-001',
};

function assertSuccess(result: ValidationResult): asserts result is { ok: true; data: { uploadUrl: string; objectKey: string; mimeType: string; fileSizeBytes: number } } {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data).toHaveProperty('uploadUrl');
    expect(result.data).toHaveProperty('objectKey');
    expect(result.data).toHaveProperty('mimeType');
    expect(result.data).toHaveProperty('fileSizeBytes');
  }
}

function assertFailure(result: ValidationResult): asserts result is { ok: false; errors: Array<{ code: string; message: string }> } {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.length).toBeGreaterThan(0);
    result.errors.forEach(err => {
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
    });
  }
}

// ── validateUploadIntent ──────────────────────────────────────────

describe('validateUploadIntent', () => {
  describe('valid audio payloads', () => {
    it('accepts valid MP3 audio upload', () => {
      const result = validateUploadIntent(VALID_AUDIO_INPUT);
      expect(result.ok).toBe(true);
    });

    it('accepts valid WAV audio upload', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        mimeType: 'audio/wav',
        fileName: 'my-track.wav',
      });
      expect(result.ok).toBe(true);
    });

    it('accepts audio at exactly 50MB boundary', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileSizeBytes: MAX_AUDIO_UPLOAD_SIZE,
      });
      expect(result.ok).toBe(true);
    });

    it('accepts audio just under 50MB', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileSizeBytes: MAX_AUDIO_UPLOAD_SIZE - 1,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('valid image payloads', () => {
    it('accepts valid JPEG image upload', () => {
      const result = validateUploadIntent({
        ...VALID_IMAGE_INPUT,
        mimeType: 'image/jpeg',
        fileName: 'cover.jpg',
      });
      expect(result.ok).toBe(true);
    });

    it('accepts valid PNG image upload', () => {
      const result = validateUploadIntent({
        ...VALID_IMAGE_INPUT,
        mimeType: 'image/png',
        fileName: 'cover.png',
      });
      expect(result.ok).toBe(true);
    });

    it('accepts valid WebP image upload', () => {
      const result = validateUploadIntent(VALID_IMAGE_INPUT);
      expect(result.ok).toBe(true);
    });

    it('accepts image at exactly 10MB boundary', () => {
      const result = validateUploadIntent({
        ...VALID_IMAGE_INPUT,
        fileSizeBytes: MAX_IMAGE_UPLOAD_SIZE,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('invalid audio payloads', () => {
    it('rejects unsupported audio MIME type', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        mimeType: 'audio/flac',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_AUDIO_MIME_TYPE')).toBe(true);
    });

    it('rejects audio file exceeding 50MB', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileSizeBytes: MAX_AUDIO_UPLOAD_SIZE + 1,
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'AUDIO_FILE_TOO_LARGE')).toBe(true);
    });

    it('rejects audio file at 100MB', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileSizeBytes: 100 * 1024 * 1024,
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'AUDIO_FILE_TOO_LARGE')).toBe(true);
    });
  });

  describe('invalid image payloads', () => {
    it('rejects unsupported image MIME type (GIF)', () => {
      const result = validateUploadIntent({
        ...VALID_IMAGE_INPUT,
        mimeType: 'image/gif',
        fileName: 'cover.gif',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_IMAGE_MIME_TYPE')).toBe(true);
    });

    it('rejects unsupported image MIME type (BMP)', () => {
      const result = validateUploadIntent({
        ...VALID_IMAGE_INPUT,
        mimeType: 'image/bmp',
        fileName: 'cover.bmp',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_IMAGE_MIME_TYPE')).toBe(true);
    });

    it('rejects image file exceeding 10MB', () => {
      const result = validateUploadIntent({
        ...VALID_IMAGE_INPUT,
        fileSizeBytes: MAX_IMAGE_UPLOAD_SIZE + 1,
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'IMAGE_FILE_TOO_LARGE')).toBe(true);
    });
  });

  describe('general field validation errors', () => {
    it('rejects invalid fileType', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileType: 'video' as 'audio' | 'image',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_FILE_TYPE')).toBe(true);
    });

    it('rejects empty fileName', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileName: '',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_FILE_NAME')).toBe(true);
    });

    it('rejects whitespace-only fileName', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileName: '   ',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_FILE_NAME')).toBe(true);
    });

    it('rejects negative fileSizeBytes', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileSizeBytes: -1,
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_FILE_SIZE')).toBe(true);
    });

    it('rejects zero fileSizeBytes', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        fileSizeBytes: 0,
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'INVALID_FILE_SIZE')).toBe(true);
    });

    it('rejects missing artistId', () => {
      const result = validateUploadIntent({
        ...VALID_AUDIO_INPUT,
        artistId: '',
      });
      assertFailure(result);
      expect(result.errors.some(e => e.code === 'MISSING_ARTIST_ID')).toBe(true);
    });
  });
});

// ── generateAudioObjectKey ─────────────────────────────────────────

describe('generateAudioObjectKey', () => {
  it('generates correct key for MP3', () => {
    const key = generateAudioObjectKey('artist-001', 'track-001', 'audio/mpeg', 'abc123');
    expect(key).toBe('audio/artist-001/track-001_abc123.mp3');
  });

  it('generates correct key for WAV', () => {
    const key = generateAudioObjectKey('artist-001', 'track-001', 'audio/wav', 'abc123');
    expect(key).toBe('audio/artist-001/track-001_abc123.wav');
  });

  it('defaults to .mp3 for unknown MIME type', () => {
    const key = generateAudioObjectKey('artist-001', 'track-001', 'audio/unknown', 'abc123');
    expect(key).toBe('audio/artist-001/track-001_abc123.mp3');
  });

  it('uses deterministic key structure: audio/{artistId}/{trackId}_{uuid}.{ext}', () => {
    const artistId = 'a1b2c3';
    const trackId = 't4d5e6';
    const uuid = 'u7v8w9';
    const key = generateAudioObjectKey(artistId, trackId, 'audio/mpeg', uuid);
    expect(key).toMatch(/^audio\/a1b2c3\/t4d5e6_u7v8w9\.mp3$/);
  });
});

// ── generateImageObjectKey ─────────────────────────────────────────

describe('generateImageObjectKey', () => {
  it('generates correct key structure for images', () => {
    const key = generateImageObjectKey('artist-001', 'img-001', 'abc123');
    expect(key).toBe('images/artist-001/img-001_abc123.webp');
  });

  it('always uses .webp extension regardless of input MIME', () => {
    const key = generateImageObjectKey('artist-001', 'img-001', 'abc123');
    expect(key).toMatch(/\.webp$/);
  });

  it('uses deterministic key structure: images/{artistId}/{imageId}_{uuid}.webp', () => {
    const artistId = 'a1b2c3';
    const imageId = 'i4d5e6';
    const uuid = 'u7v8w9';
    const key = generateImageObjectKey(artistId, imageId, uuid);
    expect(key).toMatch(/^images\/a1b2c3\/i4d5e6_u7v8w9\.webp$/);
  });
});

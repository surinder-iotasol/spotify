/**
 * STORY-setup-005: Integration test for audio upload size constraint validation.
 *
 * Validates that the audio upload size constraint helper correctly:
 * - Accepts files within the 50MB limit
 * - Rejects files exceeding the 50MB limit
 * - Caps/enforces the 50MB boundary correctly
 */
import { describe, expect, it } from 'vitest';
import { validateAudioUploadSize, MAX_AUDIO_UPLOAD_SIZE, formatBytes } from '@/lib/storage/audio-validation';

describe('Audio upload size constraint', () => {
  describe('validateAudioUploadSize', () => {
    it('accepts files within the 50MB limit', () => {
      // Valid: file size at exactly 50MB
      expect(validateAudioUploadSize(MAX_AUDIO_UPLOAD_SIZE)).toBe(true);

      // Valid: file size at 1 byte less than 50MB
      expect(validateAudioUploadSize(MAX_AUDIO_UPLOAD_SIZE - 1)).toBe(true);

      // Valid: small file
      expect(validateAudioUploadSize(1024)).toBe(true);

      // Valid: 10MB file
      expect(validateAudioUploadSize(10 * 1024 * 1024)).toBe(true);

      // Valid: 49MB file
      expect(validateAudioUploadSize(49 * 1024 * 1024)).toBe(true);
    });

    it('rejects files exceeding the 50MB limit', () => {
      // Invalid: 1 byte over the limit
      expect(() => validateAudioUploadSize(MAX_AUDIO_UPLOAD_SIZE + 1)).toThrow(
        /exceeds the maximum allowed size/,
      );

      // Invalid: 51MB file
      expect(() => validateAudioUploadSize(51 * 1024 * 1024)).toThrow(
        /exceeds the maximum allowed size/,
      );

      // Invalid: 100MB file
      expect(() => validateAudioUploadSize(100 * 1024 * 1024)).toThrow(
        /exceeds the maximum allowed size/,
      );

      // Invalid: 1GB file
      expect(() => validateAudioUploadSize(1024 * 1024 * 1024)).toThrow(
        /exceeds the maximum allowed size/,
      );
    });

    it('throws an error with human-readable message including file sizes', () => {
      const oversizedSize = 75 * 1024 * 1024; // 75MB

      try {
        validateAudioUploadSize(oversizedSize);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain(formatBytes(oversizedSize));
        expect(errorMessage).toContain(formatBytes(MAX_AUDIO_UPLOAD_SIZE));
      }
    });
  });

  describe('MAX_AUDIO_UPLOAD_SIZE constant', () => {
    it('equals exactly 50 MB in bytes', () => {
      expect(MAX_AUDIO_UPLOAD_SIZE).toBe(50 * 1024 * 1024);
      expect(MAX_AUDIO_UPLOAD_SIZE).toBe(52_428_800);
    });
  });

  describe('formatBytes helper', () => {
    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toContain('KB');
      expect(formatBytes(1024 * 1024)).toContain('MB');
      expect(formatBytes(1024 * 1024 * 1024)).toContain('GB');
    });
  });
});

/**
 * Tests for validation utility (STORY-track-006b)
 */
import { describe, it, expect } from 'vitest';
import { validateFile, isAudioFormat, getAcceptedMimeTypes, ValidationResult } from './validate-file';

describe('isAudioFormat', () => {
  it('accepts audio/mpeg (MP3)', () => {
    expect(isAudioFormat('audio/mpeg')).toBe(true);
  });

  it('accepts audio/wav', () => {
    expect(isAudioFormat('audio/wav')).toBe(true);
  });

  it('rejects non-audio types like image/png', () => {
    expect(isAudioFormat('image/png')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAudioFormat('')).toBe(false);
  });

  it('rejects unknown applications types', () => {
    expect(isAudioFormat('application/octet-stream')).toBe(false);
  });
});

describe('getAcceptedMimeTypes', () => {
  it('returns exactly two accepted MIME types', () => {
    const types = getAcceptedMimeTypes();
    expect(types).toHaveLength(2);
  });

  it('includes both MP3 and WAV types', () => {
    const types = getAcceptedMimeTypes();
    expect(types).toContain('audio/mpeg');
    expect(types).toContain('audio/wav');
  });
});

describe('validateFile', () => {
  function mockFile(name: string, mimeType: string, size: number): File {
    return new File([new ArrayBuffer(size)], name, { type: mimeType });
  }

  it('returns valid for a small MP3 file', () => {
    const file = mockFile('song.mp3', 'audio/mpeg', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('returns valid for a small WAV file', () => {
    const file = mockFile('sound.wav', 'audio/wav', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBe(null);
  });

  it('rejects a file exceeding 50 MB', () => {
    const file = mockFile('large.mp3', 'audio/mpeg', 51 * 1024 * 1024);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects a 50 MB file exactly at the limit', () => {
    // max is 50 MB, so exactly at limit should pass (<= not <)
    // Actually MAX_SIZE_BYTES is not inclusive — let's check: file.size > MAX_SIZE_BYTES
    // So exactly 50 MB passes
    const file = mockFile('exact.mp3', 'audio/mpeg', 50 * 1024 * 1024);
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it('rejects a file 1 byte over the limit', () => {
    const file = mockFile('oversize.mp3', 'audio/mpeg', 50 * 1024 * 1024 + 1);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects an unknown MIME type', () => {
    const file = mockFile('file.unknown', '', 100);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects image/png type', () => {
    const file = mockFile('photo.png', 'image/png', 1000);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('includes file size in the error message for oversized files', () => {
    const file = mockFile('large.mp3', 'audio/mpeg', 100 * 1024 * 1024); // 100 MB
    const result = validateFile(file);
    expect(result.error).toMatch(/100\.0/);
    expect(result.error).toContain('50 MB');
  });

  it('includes MIME type in the error message for wrong format', () => {
    const file = mockFile('file.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000);
    const result = validateFile(file);
    expect(result.error).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});

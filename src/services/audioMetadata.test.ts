/**
 * STORY-track-002a: Audio Metadata Extraction Service Tests
 *
 * Tests for:
 *  - CorruptedAudioError class (extends Error, carries fileKey and reason)
 *  - AudioMetadataInfo type shape (duration, bitrate, sampleRate, channels, codec, durationMs)
 *  - extractAudioMetadata signature (accepts StorageProvider + fileKey, returns Promise<AudioMetadata>)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CorruptedAudioError,
  extractAudioMetadata,
  AudioMetadataInfo,
} from './audioMetadata';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

function createMockStorageProvider(
  data: Buffer,
): import('@/lib/storage/storage-provider').StorageProvider {
  return {
    generatePresignedUploadUrl: vi.fn().mockResolvedValue('http://mock.upload.url'),
    generatePresignedDownloadUrl: vi.fn().mockResolvedValue('http://mock.download.url'),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getObjectMetadata: vi.fn().mockResolvedValue({
      size: data.length,
      contentType: 'audio/mpeg',
      lastModified: new Date(),
      eTag: 'mock-etag',
    }),
    readHeaderBytes: vi.fn().mockResolvedValue(data.slice(0, 8192)),
  };
}

/* ------------------------------------------------------------------ */
/*  CorruptedAudioError — acceptance criteria                          */
/* ------------------------------------------------------------------ */

describe('CorruptedAudioError', () => {
  it('is a typed Error subclass', () => {
    const err = new CorruptedAudioError('test reason', 'test.mp3');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CorruptedAudioError);
  });

  it('exports as a class/function in the module', async () => {
    const mod = await import('./audioMetadata');
    expect(typeof mod.CorruptedAudioError).toBe('function');
  });

  it('carries a message describing the corruption reason', () => {
    const reason = 'MP3 sync word missing at offset 0';
    const err = new CorruptedAudioError(reason, 'test.mp3');
    expect(err.message).toBe(reason);
  });

  it('exports fileKey and reason fields', () => {
    const key = 'uploads/abc123.mp3';
    const reason = 'truncated header';
    const err = new CorruptedAudioError(reason, key);
    expect(err.fileKey).toBe(key);
    expect(err.reason).toBe(reason);
  });
});

/* ------------------------------------------------------------------ */
/*  AudioMetadataInfo — acceptance criteria                            */
/* ------------------------------------------------------------------ */

describe('AudioMetadataInfo type', () => {
  it('has duration, bitrate, sampleRate, channels, codec, and durationMs fields', () => {
    const meta: AudioMetadataInfo = {
      duration: 245.67,
      bitrate: 320000,
      sampleRate: 44100,
      channels: 2,
      codec: 'mp3',
      durationMs: 245670,
    };
    expect(typeof meta.duration).toBe('number');
    expect(typeof meta.bitrate).toBe('number');
    expect(typeof meta.sampleRate).toBe('number');
    expect(typeof meta.channels).toBe('number');
    expect(typeof meta.codec).toBe('string');
    expect(typeof meta.durationMs).toBe('number');
  });
});

/* ------------------------------------------------------------------ */
/*  extractAudioMetadata — acceptance criteria                         */
/* ------------------------------------------------------------------ */

describe('extractAudioMetadata', () => {
  it('is exported as a function', () => {
    expect(typeof extractAudioMetadata).toBe('function');
  });

  it('returns a Promise<AudioMetadata>', async () => {
    const storage = createMockStorageProvider(Buffer.from(''));
    const result = extractAudioMetadata(storage, 'test.mp3');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toBeDefined();
  });

  it('throws CorruptedAudioError for empty files', async () => {
    const storage = createMockStorageProvider(Buffer.from(''));
    (storage.readHeaderBytes as ReturnType<typeof vi.fn>).mockResolvedValue(
      Buffer.alloc(0),
    );
    await expect(extractAudioMetadata(storage, 'empty.mp3')).rejects.toThrow(
      CorruptedAudioError,
    );
  });

  it('throws CorruptedAudioError for unrecognized format', async () => {
    const storage = createMockStorageProvider(Buffer.from('zzzzzzzzzzzz'));
    await expect(extractAudioMetadata(storage, 'weird.bin')).rejects.toThrow(
      CorruptedAudioError,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Module loads (original tests retained)                             */
/* ------------------------------------------------------------------ */

describe('AudioMetadataService — module loads', () => {
  it('exports extractAudioMetadata', async () => {
    const mod = await import('./audioMetadata');
    expect(typeof mod.extractAudioMetadata).toBe('function');
  });

  it('exports CorruptedAudioError', async () => {
    const mod = await import('./audioMetadata');
    expect(typeof mod.CorruptedAudioError).toBe('function');
  });
});

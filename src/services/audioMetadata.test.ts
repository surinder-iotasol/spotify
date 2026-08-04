/**
 * STORY-track-002a: Audio Metadata Extraction Service Tests
 *
 * Tests for:
 *  - CorruptedAudioError class (extends Error, carries key and message)
 *  - AudioMetadata interface shape
 *  - extractAudioMetadata signature (accepts StorageProvider + fileKey, returns Promise<AudioMetadata>)
 *  - Container format detection (MP3, WAV, OGG magic bytes)
 *  - Empty file error path
 *  - Unrecognized format error path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a hex string to a Buffer.
 */
function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

/**
 * Mock StorageProvider that returns the given bytes for a key.
 */
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
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CorruptedAudioError — class contract', () => {
  it('is a named Error subclass', async () => {
    const mod = await import('./audioMetadata');
    const ErrorClass = mod.CorruptedAudioError;

    const err = new ErrorClass('test reason', 'test-key.mp3');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ErrorClass);
    expect(err.name).toBe('CorruptedAudioError');
  });

  it('carries the provided message', async () => {
    const mod = await import('./audioMetadata');
    const ErrorClass = mod.CorruptedAudioError;

    const msg = 'file is truncated';
    const err = new ErrorClass(msg, 'song.mp3');
    expect(err.message).toBe(msg);
  });

  it('carries the storage key', async () => {
    const mod = await import('./audioMetadata');
    const ErrorClass = mod.CorruptedAudioError;

    const key = 'uploads/2024/track-42.mp3';
    const err = new ErrorClass('bad header', key);
    expect(err.key).toBe(key);
  });

  it('preserves prototype chain via setPrototypeOf', async () => {
    const mod = await import('./audioMetadata');
    const ErrorClass = mod.CorruptedAudioError;

    const err = new ErrorClass('reason', 'key');
    expect(Object.getPrototypeOf(err)).toBe(ErrorClass.prototype);
  });
});

describe('AudioMetadata — interface shape', () => {
  it('exports AudioMetadata type under the expected contract', async () => {
    const mod = await import('./audioMetadata');

    // The interface itself is a compile-time construct; we verify the
    // extractAudioMetadata function returns something compatible by
    // checking the function's JSDoc / shape indirectly through tests.
    expect(typeof mod.extractAudioMetadata).toBe('function');
  });
});

describe('extractAudioMetadata — function contract', () => {
  let mockStorage: import('@/lib/storage/storage-provider').StorageProvider;

  beforeEach(() => {
    mockStorage = createMockStorageProvider(Buffer.from(''));
  });

  it('accepts a StorageProvider and file key, returns Promise<AudioMetadata>', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata } = mod;

    const key = 'test.mp3';
    const result = extractAudioMetadata(mockStorage, key);

    expect(result).toBeInstanceOf(Promise);

    // The result should reject with CorruptedAudioError because the mock
    // buffer is empty, but the important contract check is that it resolves/
    // rejects as a Promise<AudioMetadata>.
    await expect(result).rejects.toThrow();
  });

  it('reads header bytes via storage.readHeaderBytes', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata } = mod;

    const key = 'test.wav';
    const fullBuffer = Buffer.from(
      'RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00\x44\xac\x00\x00\x10\xb1\x02\x00\x04\x00\x10\x00data\x00\x00\x00\x00',
    );
    mockStorage = createMockStorageProvider(fullBuffer);

    await extractAudioMetadata(mockStorage, key).catch(() => {
      // WAV parser stub throws; we only care that readHeaderBytes was called.
    });

    expect(mockStorage.readHeaderBytes).toHaveBeenCalledWith(
      key,
      expect.objectContaining({ byteCount: 8192 }),
    );
  });

  it('throws CorruptedAudioError for empty files', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata, CorruptedAudioError } = mod;

    const key = 'empty.mp3';
    mockStorage = createMockStorageProvider(Buffer.from(''));
    // readHeaderBytes returns an empty buffer since the buffer is empty
    (mockStorage.readHeaderBytes as ReturnType<typeof vi.fn>).mockResolvedValue(
      Buffer.alloc(0),
    );

    await expect(extractAudioMetadata(mockStorage, key)).rejects.toThrow(
      CorruptedAudioError,
    );
  });

  it('throws CorruptedAudioError for unrecognized format', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata, CorruptedAudioError } = mod;

    const key = 'weird.bin';
    const data = Buffer.from('zzzzzzzzzzzzzzzz');
    mockStorage = createMockStorageProvider(data);

    await expect(extractAudioMetadata(mockStorage, key)).rejects.toThrow(
      CorruptedAudioError,
    );
  });

  it('MP3 magic bytes are detected', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata, CorruptedAudioError } = mod;

    // 0xFF 0xFB is a valid MPEG-1/2 layer 3 sync word
    const mp3Header = Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Array(64).fill(0)]);
    mockStorage = createMockStorageProvider(mp3Header);

    // The MP3 parser stub throws CorruptedAudioError with a known message.
    await expect(extractAudioMetadata(mockStorage, 'test.mp3')).rejects.toThrow(
      /MP3 header parsing not yet implemented/,
    );
  });

  it('WAV magic bytes are detected', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata, CorruptedAudioError } = mod;

    // RIFF .... WAVE ....
    const wavHeader = Buffer.from(
      'RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00\x44\xac\x00\x00\x10\xb1\x02\x00\x04\x00\x10\x00data\x00\x00\x00\x00',
    );
    mockStorage = createMockStorageProvider(wavHeader);

    await expect(extractAudioMetadata(mockStorage, 'test.wav')).rejects.toThrow(
      /WAV header parsing not yet implemented/,
    );
  });

  it('OGG magic bytes are detected', async () => {
    const mod = await import('./audioMetadata');
    const { extractAudioMetadata, CorruptedAudioError } = mod;

    const oggHeader = Buffer.from('OggS' + 'x'.repeat(64));
    mockStorage = createMockStorageProvider(oggHeader);

    await expect(extractAudioMetadata(mockStorage, 'test.ogg')).rejects.toThrow(
      /OGG header parsing not yet implemented/,
    );
  });
});

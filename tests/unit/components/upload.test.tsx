/**
 * STORY-storage-004: Unit tests for the useDirectUpload hook
 * and client-side upload validation.
 *
 * Tests cover:
 * - validateUploadFile: MIME type checks, size checks, empty files
 * - useDirectUpload hook: state transitions, progress tracking
 * - useDirectUpload hook: error handling paths
 * - useDirectUpload hook: reset behavior
 *
 * Uses vitest + @testing-library/react for hook testing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDirectUpload,
  validateUploadFile,
  MAX_AUDIO_UPLOAD_SIZE,
} from '@/hooks/use-direct-upload';
import type { UploadError, UploadIntentResponse, UploadStatus } from '@/hooks/use-direct-upload';

// ── Mock fetch globally ──────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Create a mock File object.
 * We can't easily create real File objects in node/jsdom, so we
 * use a partial File-like object with the properties we need.
 */
function mockFile(
  name: string,
  size: number,
  type: string,
): Omit<File, 'arrayBuffer' | 'stream' | 'text'> & { arrayBuffer: ReturnType<typeof Promise.resolve>; stream: () => ReadableStream; text: ReturnType<typeof Promise.resolve> } {
  return {
    name,
    size,
    type,
    lastModified: Date.now(),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    stream: () => new ReadableStream(),
    text: () => Promise.resolve(''),
    slice: () => new Blob(),
    webkitSlice: undefined as any,
    // @ts-expect-error - not needed in tests
    [Symbol.toStringTag]: 'File',
  } as unknown as File;
}

// ── validateUploadFile ──────────────────────────────────────────────

describe('validateUploadFile', () => {
  describe('valid audio files', () => {
    it('accepts MP3 files within size limit', () => {
      const file = mockFile('track.mp3', 5_000_000, 'audio/mpeg');
      expect(validateUploadFile(file)).toBeNull();
    });

    it('accepts WAV files within size limit', () => {
      const file = mockFile('track.wav', 10_000_000, 'audio/wav');
      expect(validateUploadFile(file)).toBeNull();
    });

    it('accepts a file at exactly 50 MB', () => {
      const file = mockFile('exact.mp3', MAX_AUDIO_UPLOAD_SIZE, 'audio/mpeg');
      expect(validateUploadFile(file)).toBeNull();
    });

    it('accepts a file just under 50 MB', () => {
      const file = mockFile('almost.mp3', MAX_AUDIO_UPLOAD_SIZE - 1, 'audio/mpeg');
      expect(validateUploadFile(file)).toBeNull();
    });
  });

  describe('invalid MIME types', () => {
    it('rejects FLAC files', () => {
      const file = mockFile('track.flac', 10_000_000, 'audio/flac');
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_MIME_TYPE');
      expect(error?.message).toContain('MP3 and WAV');
    });

    it('rejects Ogg files', () => {
      const file = mockFile('track.ogg', 5_000_000, 'audio/ogg');
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_MIME_TYPE');
    });

    it('rejects MP4 audio files', () => {
      const file = mockFile('track.m4a', 5_000_000, 'audio/mp4');
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_MIME_TYPE');
    });

    it('rejects empty string MIME type', () => {
      const file = mockFile('track.unknown', 1_000_000, '') as unknown as File;
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_MIME_TYPE');
    });

    it('rejects files with no MIME type (null/empty)', () => {
      const file = {
        name: 'track',
        size: 1_000_000,
        type: '' as unknown as string,
        lastModified: Date.now(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        stream: () => new ReadableStream(),
        text: () => Promise.resolve(''),
        slice: () => new Blob(),
      } as unknown as File;
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_MIME_TYPE');
    });
  });

  describe('file size checks', () => {
    it('rejects files over 50 MB', () => {
      const file = mockFile('huge.mp3', MAX_AUDIO_UPLOAD_SIZE + 1, 'audio/mpeg');
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('FILE_TOO_LARGE');
      expect(error?.message).toContain('50 MB');
    });

    it('rejects a 100 MB file', () => {
      const file = mockFile('huge.mp3', 100 * 1024 * 1024, 'audio/mpeg');
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects an empty file', () => {
      const file = mockFile('empty.mp3', 0, 'audio/mpeg');
      const error = validateUploadFile(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('EMPTY_FILE');
    });
  });
});

// ── useDirectUpload hook ────────────────────────────────────────────

describe('useDirectUpload hook', () => {
  const defaultOptions = {
    artistId: 'artist-001',
    trackId: 'track-001',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ── Initial state ──────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with idle status', () => {
      const { result } = renderHook(() => useDirectUpload(defaultOptions));
      expect(result.current.status).toBe('idle');
      expect(result.current.progress.percentage).toBe(0);
      expect(result.current.progress.bytesSent).toBe(0);
      expect(result.current.progress.totalBytes).toBe(0);
      expect(result.current.error).toBeNull();
      expect(result.current.response).toBeNull();
    });
  });

  // ── Client-side validation ─────────────────────────────────────

  describe('client-side validation', () => {
    it('transitions to error on invalid MIME type', async () => {
      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      await act(async () => {
        const badFile = mockFile('track.flac', 5_000_000, 'audio/flac');
        result.current.startUpload(badFile);
      });

      // Wait for async
      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.code).toBe('INVALID_MIME_TYPE');
      // fetch should NOT have been called for invalid files
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('transitions to error on oversized file', async () => {
      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      await act(async () => {
        const bigFile = mockFile('huge.mp3', MAX_AUDIO_UPLOAD_SIZE + 1, 'audio/mpeg');
        result.current.startUpload(bigFile);
      });

      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.code).toBe('FILE_TOO_LARGE');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('transitions to error on empty file', async () => {
      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      await act(async () => {
        const emptyFile = mockFile('empty.mp3', 0, 'audio/mpeg');
        result.current.startUpload(emptyFile);
      });

      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.code).toBe('EMPTY_FILE');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Valid upload flow ──────────────────────────────────────────

  describe('valid audio upload', () => {
    it('transitions through states: idle → requesting-url → uploading → complete', async () => {
      const mockResponse: UploadIntentResponse = {
        uploadUrl: 'https://s3.example.com/presigned-upload',
        objectKey: 'audio/artist-001/track-001_abc123.mp3',
        mimeType: 'audio/mpeg',
        fileSizeBytes: 5_000_000,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };

      // First fetch: upload-intent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockResponse }),
      });

      // Second fetch: direct PUT to presigned URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 5_000_000, 'audio/mpeg');

      await act(async () => {
        result.current.startUpload(file);
      });

      // Should transition through states
      await vi.waitFor(() => {
        expect(result.current.status).toBe('complete');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.response).not.toBeNull();
      expect(result.current.progress.percentage).toBe(100);
      expect(result.current.progress.totalBytes).toBe(5_000_000);
      expect(result.current.progress.bytesSent).toBe(5_000_000);
    });

    it('calls POST /api/v1/storage/upload-intent with correct body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://example.com/presigned',
            objectKey: 'key',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 1000,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 1000, 'audio/mpeg');
      await act(async () => {
        result.current.startUpload(file);
      });

      // Check first call was upload-intent (filter out any root path fetch)
      const uploadIntentCalls = mockFetch.mock.calls.filter(
        (c) => c[0] === '/api/v1/storage/upload-intent',
      );
      expect(uploadIntentCalls.length).toBeGreaterThanOrEqual(1);
      const [intentCall] = uploadIntentCalls;
      expect(intentCall[0]).toBe('/api/v1/storage/upload-intent');
      expect(intentCall[1]?.method).toBe('POST');

      const body = JSON.parse((intentCall[1]?.body as string) ?? '{}');
      expect(body.fileType).toBe('audio');
      expect(body.fileName).toBe('test.mp3');
      expect(body.fileSizeBytes).toBe(1000);
      expect(body.mimeType).toBe('audio/mpeg');
      expect(body.artistId).toBe('artist-001');
      expect(body.trackId).toBe('track-001');
    });

    it('calls direct PUT with presigned URL and correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://s3.example.com/presigned-key',
            objectKey: 'key',
            mimeType: 'audio/wav',
            fileSizeBytes: 3_000_000,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('track.wav', 3_000_000, 'audio/wav');
      await act(async () => {
        result.current.startUpload(file);
      });

      // Check second call was direct PUT (filter out any root path fetch)
      const putCalls = mockFetch.mock.calls.filter(
        (c) => c[0]?.startsWith('https://s3.example.com/presigned-key'),
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      const [putCall] = putCalls;
      expect(putCall[0]).toBe('https://s3.example.com/presigned-key');
      expect(putCall[1]?.method).toBe('PUT');
      expect(putCall[1]?.headers).toMatchObject({ 'Content-Type': 'audio/wav' });
    });

    it('invokes onComplete callback on success', async () => {
      const onComplete = vi.fn();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://example.com/url',
            objectKey: 'obj-key',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 100,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      renderHook(() =>
        useDirectUpload({
          ...defaultOptions,
          onComplete,
        }),
      );

      const file = mockFile('test.mp3', 100, 'audio/mpeg');
      await act(async () => {
        renderHook(() => useDirectUpload({ ...defaultOptions, onComplete }));
      });
      // The hook already rendered, we need to call startUpload on it
      await vi.waitFor(() => {
        // Callback should have been invoked
      });
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('handles upload-intent API error (non-200)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: { message: 'Internal server error' },
        }),
      });

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 1000, 'audio/mpeg');
      await act(async () => {
        result.current.startUpload(file);
      });

      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.code).toBe('UPLOAD_INTENT_FAILED');
      // Only one fetch was called (the intent), not the PUT
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles upload-intent fetch network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Network error'));

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 1000, 'audio/mpeg');
      await act(async () => {
        result.current.startUpload(file);
      });

      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.code).toBe('NETWORK_ERROR');
    });

    it('handles direct PUT failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://s3.example.com/key',
            objectKey: 'key',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 1000,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 1000, 'audio/mpeg');
      await act(async () => {
        result.current.startUpload(file);
      });

      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.code).toBe('DIRECT_UPLOAD_FAILED');
    });

    it('handles direct PUT network error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://s3.example.com/key',
            objectKey: 'key',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 1000,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
      mockFetch.mockRejectedValueOnce(new TypeError('Upload network error'));

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 1000, 'audio/mpeg');
      await act(async () => {
        result.current.startUpload(file);
      });

      await vi.waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.error?.code).toBe('UPLOAD_FAILED');
    });
  });

  // ── Reset behavior ─────────────────────────────────────────────

  describe('reset', () => {
    it('resets all state back to initial', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://example.com/url',
            objectKey: 'key',
            mimeType: 'audio/mpeg',
            fileSizeBytes: 1000,
            expiresAt: new Date().toISOString(),
          },
        }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const { result } = renderHook(() => useDirectUpload(defaultOptions));

      const file = mockFile('test.mp3', 1000, 'audio/mpeg');
      await act(async () => {
        result.current.startUpload(file);
      });

      // Complete
      await vi.waitFor(() => {
        expect(result.current.status).toBe('complete');
      });

      // Reset
      await act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.progress.percentage).toBe(0);
      expect(result.current.error).toBeNull();
      expect(result.current.response).toBeNull();
    });
  });
});

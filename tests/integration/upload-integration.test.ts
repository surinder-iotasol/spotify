/**
 * STORY-storage-002: Integration test for POST /api/v1/storage/upload-intent.
 *
 * Verifies:
 * - Valid audio payloads return HTTP 200 with presigned URL
 * - Invalid audio payloads return HTTP 422 with details
 * - Valid image payloads return HTTP 200
 * - Invalid image payloads return HTTP 422
 * - Validation error structure is correct
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted via vi.hoisted to coexist with vi.mock hoisting) ──
// vi.mock() calls are hoisted to the top of the file, so all mock
// values it references must be defined via vi.hoisted() and accessed
// through the returned object (not destructured) to avoid TDZ issues.

const storageMocks = vi.hoisted(() => {
  const mockGeneratePresignedUploadUrl = vi.fn().mockResolvedValue('https://mock-s3.example.com/presigned-upload-url');
  const mockCreateStorageProvider = vi.fn().mockReturnValue({
    generatePresignedUploadUrl: mockGeneratePresignedUploadUrl,
  });
  return {
    mockGeneratePresignedUploadUrl,
    mockCreateStorageProvider,
  };
});

// Mock AWS SDK dependencies that storage-provider.ts imports.
// These are needed because Vitest still parses storage-provider.ts to
// understand its exports, even when the test mocks it at a higher level.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-s3.example.com/presigned-url'),
}));

vi.mock('@/lib/storage/s3-client-factory', () => ({
  createS3Client: vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue({}) }),
}));

// Mock the storage-provider module, providing all exports so Vitest doesn't
// try to load the real module during static analysis.
vi.mock('@/lib/storage/storage-provider', () => ({
  createStorageProvider: storageMocks.mockCreateStorageProvider,
  S3StorageProvider: vi.fn(),
  R2StorageProvider: vi.fn(),
}));

// Import after mocks
import { POST } from '@/app/api/v1/storage/route';

// ── Helpers ────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Parameters<typeof POST>[0];
}

// ── Test Data ──────────────────────────────────────────────────────

const VALID_AUDIO_PAYLOAD = {
  fileType: 'audio',
  fileName: 'my-track.mp3',
  fileSizeBytes: 5_000_000,
  mimeType: 'audio/mpeg',
  artistId: 'artist-001',
  trackId: 'track-001',
};

const VALID_IMAGE_PAYLOAD = {
  fileType: 'image',
  fileName: 'cover.webp',
  fileSizeBytes: 1_000_000,
  mimeType: 'image/webp',
  artistId: 'artist-001',
  imageId: 'img-001',
};

// ── Integration Tests ──────────────────────────────────────────────

describe('POST /api/v1/storage/upload-intent — Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValue('https://mock-s3.example.com/presigned-upload-url');
  });

  describe('valid audio payloads', () => {
    it('returns 200 OK with presigned URL for valid MP3 upload', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/abc123');

      const response = await POST(createRequest(VALID_AUDIO_PAYLOAD));
      expect(response.status).toBe(200);

      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('uploadUrl');
      expect(body.data.uploadUrl).toBe('https://s3.example.com/put/abc123');
      expect(body.data).toHaveProperty('objectKey');
      expect(body.data.objectKey).toMatch(/^audio\/artist-001\/track-001_[a-f0-9-]+\.mp3$/);
      expect(body.data.mimeType).toBe('audio/mpeg');
      expect(body.data.fileSizeBytes).toBe(5_000_000);
      expect(body.data).toHaveProperty('expiresAt');
    });

    it('returns 200 OK for valid WAV upload', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/def456');

      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        mimeType: 'audio/wav',
        fileName: 'my-track.wav',
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.data.objectKey).toMatch(/\.wav$/);
    });

    it('returns 200 OK for audio at exactly 50MB boundary', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/boundary');

      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        fileSizeBytes: 52_428_800,
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(true);
    });
  });

  describe('valid image payloads', () => {
    it('returns 200 OK for valid WebP image upload', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/img001');

      const response = await POST(createRequest(VALID_IMAGE_PAYLOAD));

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.data.objectKey).toMatch(/^images\/artist-001\/img-001_[a-f0-9-]+\.webp$/);
    });

    it('returns 200 OK for valid JPEG image upload', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/jpeg001');

      const response = await POST(createRequest({
        ...VALID_IMAGE_PAYLOAD,
        mimeType: 'image/jpeg',
        fileName: 'cover.jpg',
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(true);
      // All images should use .webp extension in the key
      expect(body.data.objectKey).toMatch(/\.webp$/);
    });

    it('returns 200 OK for valid PNG image upload', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/png001');

      const response = await POST(createRequest({
        ...VALID_IMAGE_PAYLOAD,
        mimeType: 'image/png',
        fileName: 'cover.png',
      }));

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(true);
    });
  });

  describe('invalid audio payloads', () => {
    it('returns 422 for unsupported audio MIME type', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        mimeType: 'audio/flac',
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.error.details).toBeDefined();
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details!.some((d: { code: string }) => d.code === 'INVALID_AUDIO_MIME_TYPE')).toBe(true);
    });

    it('returns 422 for audio file exceeding 50MB', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        fileSizeBytes: 52_428_801,
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.error.details!.some((d: { code: string }) => d.code === 'AUDIO_FILE_TOO_LARGE')).toBe(true);
    });

    it('returns 422 for audio file at 100MB', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        fileSizeBytes: 100 * 1024 * 1024,
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
    });
  });

  describe('invalid image payloads', () => {
    it('returns 422 for unsupported image MIME type', async () => {
      const response = await POST(createRequest({
        ...VALID_IMAGE_PAYLOAD,
        mimeType: 'image/gif',
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.error.details!.some((d: { code: string }) => d.code === 'INVALID_IMAGE_MIME_TYPE')).toBe(true);
    });

    it('returns 422 for image file exceeding 10MB', async () => {
      const response = await POST(createRequest({
        ...VALID_IMAGE_PAYLOAD,
        fileSizeBytes: 10_485_761,
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.error.details!.some((d: { code: string }) => d.code === 'IMAGE_FILE_TOO_LARGE')).toBe(true);
    });
  });

  describe('field validation', () => {
    it('returns 422 for invalid fileType', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        fileType: 'video',
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
    });

    it('returns 422 for empty fileName', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        fileName: '',
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
    });

    it('returns 422 for negative fileSizeBytes', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        fileSizeBytes: -1,
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
    });

    it('returns 422 for missing artistId', async () => {
      const response = await POST(createRequest({
        ...VALID_AUDIO_PAYLOAD,
        artistId: '',
      }));

      expect(response.status).toBe(422);
      const body = await response.json() as Record<string, unknown>;
      expect(body.success).toBe(false);
    });
  });

  describe('response structure', () => {
    it('response body has required fields: uploadUrl, objectKey, mimeType, fileSizeBytes, expiresAt', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/url');

      const response = await POST(createRequest(VALID_AUDIO_PAYLOAD));
      const body = await response.json() as Record<string, unknown>;
      const data = body.data as Record<string, unknown>;

      expect(data).toHaveProperty('uploadUrl');
      expect(data).toHaveProperty('objectKey');
      expect(data).toHaveProperty('mimeType');
      expect(data).toHaveProperty('fileSizeBytes');
      expect(data).toHaveProperty('expiresAt');
    });

    it('response meta contains timestamp and requestId', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/url');

      const response = await POST(createRequest(VALID_AUDIO_PAYLOAD));
      const body = await response.json() as Record<string, unknown>;

      expect(body.meta).toHaveProperty('timestamp');
      expect(body.meta).toHaveProperty('requestId');
    });
  });

  describe('presigned URL generation', () => {
    it('calls createStorageProvider and generatePresignedUploadUrl with correct parameters', async () => {
      storageMocks.mockGeneratePresignedUploadUrl.mockResolvedValueOnce('https://s3.example.com/put/test-key');

      await POST(createRequest(VALID_AUDIO_PAYLOAD));

      expect(storageMocks.mockGeneratePresignedUploadUrl).toHaveBeenCalledTimes(1);
      const call = storageMocks.mockGeneratePresignedUploadUrl.mock.calls[0];
      const key = call[0] as string;
      const options = call[1] as { ttl?: number; contentType?: string };

      expect(key).toMatch(/^audio\/artist-001\/track-001_[a-f0-9-]+\.mp3$/);
      expect(options.ttl).toBe(3600);
      expect(options.contentType).toBe('audio/mpeg');
    });
  });
});

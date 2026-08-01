/**
 * STORY-storage-001: Unit tests for StorageProvider interface and implementations.
 *
 * Tests cover:
 * - S3StorageProvider: presigned upload/download URLs, delete, metadata
 * - R2StorageProvider: presigned upload/download URLs, delete, metadata
 * - createStorageProvider factory: env var selection and type override
 * - Error handling across all operations
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted runs at the very top of the file, before vi.mock() is hoisted.
// This ensures the mock arrays are available when the mock factory executes.
const { _mockPutObjectInputs, _mockGetObjectInputs, _mockDeleteObjectInputs, _mockHeadObjectInputs, makeMockClass, clearMockData } =
  vi.hoisted(() => {
    const _mockPutObjectInputs: unknown[][] = [];
    const _mockGetObjectInputs: unknown[][] = [];
    const _mockDeleteObjectInputs: unknown[][] = [];
    const _mockHeadObjectInputs: unknown[][] = [];

    function clearMockData() {
      _mockPutObjectInputs.length = 0;
      _mockGetObjectInputs.length = 0;
      _mockDeleteObjectInputs.length = 0;
      _mockHeadObjectInputs.length = 0;
    }

    function makeMockClass(
      collectInputArray: unknown[][],
      defaultReturn: Record<string, unknown> = { input: {} },
    ) {
      const mockClass = function (params: Record<string, unknown>) {
        collectInputArray.push([params]);
        return defaultReturn;
      } as unknown as new (params?: Record<string, unknown>) => Record<string, unknown>;
      return mockClass;
    }

    return { _mockPutObjectInputs, _mockGetObjectInputs, _mockDeleteObjectInputs, _mockHeadObjectInputs, makeMockClass, clearMockData };
  });

// Use vi.mock with factory. Each exported member must be constructor-compatible.
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
    PutObjectCommand: makeMockClass(_mockPutObjectInputs),
    GetObjectCommand: makeMockClass(_mockGetObjectInputs),
    DeleteObjectCommand: makeMockClass(_mockDeleteObjectInputs),
    HeadObjectCommand: makeMockClass(_mockHeadObjectInputs),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned-url.example.com'),
}));

vi.mock('@/lib/storage/s3-client-factory', () => {
  const { S3Client } = require('@aws-sdk/client-s3');
  return {
    createS3Client: vi.fn().mockImplementation(() => new S3Client()),
  };
});

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client } from '@/lib/storage/s3-client-factory';
import {
  S3StorageProvider,
  R2StorageProvider,
  createStorageProvider,
  type StorageProvider,
  type StorageProviderConfig,
  type ObjectMetadata,
} from '@/lib/storage/storage-provider';

// ── Helpers ────────────────────────────────────────────────────────

const MOCK_CONFIG: StorageProviderConfig = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.us-east-1.amazonaws.com',
};

const MOCK_R2_CONFIG: StorageProviderConfig = {
  bucket: 'r2-bucket',
  region: 'auto',
  endpoint: 'https://account-id.r2.cloudflarestorage.com',
};

// ── S3StorageProvider ──────────────────────────────────────────────

describe('S3StorageProvider', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = 's3';
    vi.clearAllMocks();
    clearMockData();
  });

  afterEach(() => {
    process.env.STORAGE_PROVIDER = originalEnv;
  });

  describe('generatePresignedUploadUrl', () => {
    it('calls getSignedUrl with PutObjectCommand and correct TTL', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://s3.example.com/put-url');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      const url = await provider.generatePresignedUploadUrl('audio/test.mp3', {
        contentType: 'audio/mpeg',
      });

      expect(url).toBe('https://s3.example.com/put-url');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
      expect(_mockPutObjectInputs.length).toBe(1);
    });

    it('uses custom TTL when provided', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/put');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedUploadUrl('audio/test.mp3', { ttl: 1800 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(1800);
    });

    it('caps TTL at MAX_TTL (3600)', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/put');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedUploadUrl('audio/test.mp3', { ttl: 7200 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });

    it('includes ContentType in command when provided', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/put');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedUploadUrl('audio/test.mp3', {
        contentType: 'audio/mpeg',
      });

      const params = _mockPutObjectInputs[0][0] as Record<string, unknown>;
      expect(params).toHaveProperty('ContentType', 'audio/mpeg');
    });

    it('omits ContentType when not provided', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/put');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedUploadUrl('audio/test.mp3');

      const params = _mockPutObjectInputs[0][0] as Record<string, unknown>;
      expect(params).not.toHaveProperty('ContentType');
    });

    it('uses default TTL (3600) when no options provided', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/put');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedUploadUrl('audio/test.mp3');

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });
  });

  describe('generatePresignedDownloadUrl', () => {
    it('calls getSignedUrl with GetObjectCommand and correct TTL', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://s3.example.com/get-url');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      const url = await provider.generatePresignedDownloadUrl('audio/test.mp3');

      expect(url).toBe('https://s3.example.com/get-url');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(900);
      expect(_mockGetObjectInputs.length).toBe(1);
    });

    it('uses custom TTL when provided', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/get');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedDownloadUrl('audio/test.mp3', { ttl: 600 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(600);
    });

    it('caps TTL at MAX_TTL (3600)', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/get');

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.generatePresignedDownloadUrl('audio/test.mp3', { ttl: 7200 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand to S3', async () => {
      const s3ClientSend = vi.fn().mockResolvedValue({});
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new S3StorageProvider(MOCK_CONFIG);
      await provider.deleteObject('audio/test.mp3');

      expect(s3ClientSend).toHaveBeenCalledTimes(1);
      const params = _mockDeleteObjectInputs[0][0] as Record<string, unknown>;
      expect(params).toHaveProperty('Bucket', 'test-bucket');
      expect(params).toHaveProperty('Key', 'audio/test.mp3');
    });

    it('throws when S3 delete fails', async () => {
      const s3ClientSend = vi.fn().mockRejectedValue(new Error('AccessDenied'));
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new S3StorageProvider(MOCK_CONFIG);

      await expect(provider.deleteObject('protected/file.mp3')).rejects.toThrow('AccessDenied');
    });
  });

  describe('getObjectMetadata', () => {
    it('returns metadata from HeadObjectCommand response', async () => {
      const mockMetadata = {
        ContentLength: 5242880,
        ContentType: 'audio/mpeg',
        LastModified: new Date('2024-01-15T10:30:00Z'),
        ETag: '"abc123def456"',
      };
      const s3ClientSend = vi.fn().mockResolvedValue(mockMetadata);
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new S3StorageProvider(MOCK_CONFIG);
      const metadata = await provider.getObjectMetadata('audio/test.mp3');

      expect(metadata).toEqual({
        size: 5242880,
        contentType: 'audio/mpeg',
        lastModified: new Date('2024-01-15T10:30:00Z'),
        eTag: 'abc123def456',
      });
    });

    it('returns default values when HeadObject omits fields', async () => {
      const s3ClientSend = vi.fn().mockResolvedValue({});
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new S3StorageProvider(MOCK_CONFIG);
      const metadata = await provider.getObjectMetadata('audio/test.mp3');

      expect(metadata.size).toBe(0);
      expect(metadata.contentType).toBe('');
      expect(metadata.eTag).toBe('');
      expect(metadata.lastModified).toBeInstanceOf(Date);
    });

    it('throws when HeadObject fails', async () => {
      const s3ClientSend = vi.fn().mockRejectedValue(new Error('NoSuchKey'));
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new S3StorageProvider(MOCK_CONFIG);

      await expect(provider.getObjectMetadata('nonexistent.mp3')).rejects.toThrow('NoSuchKey');
    });
  });
});

// ── R2StorageProvider ──────────────────────────────────────────────

describe('R2StorageProvider', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = 'r2';
    vi.clearAllMocks();
    clearMockData();
  });

  afterEach(() => {
    process.env.STORAGE_PROVIDER = originalEnv;
  });

  describe('generatePresignedUploadUrl', () => {
    it('calls getSignedUrl with PutObjectCommand and correct TTL', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://r2.example.com/put-url');

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      const url = await provider.generatePresignedUploadUrl('images/avatar.webp', {
        contentType: 'image/webp',
      });

      expect(url).toBe('https://r2.example.com/put-url');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });

    it('uses default TTL (3600) for uploads', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/put');

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      await provider.generatePresignedUploadUrl('images/photo.webp');

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });
  });

  describe('generatePresignedDownloadUrl', () => {
    it('calls getSignedUrl with GetObjectCommand and correct TTL', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://r2.example.com/get-url');

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      const url = await provider.generatePresignedDownloadUrl('audio/track.mp3');

      expect(url).toBe('https://r2.example.com/get-url');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(900);
    });

    it('uses custom TTL when provided', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/get');

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      await provider.generatePresignedDownloadUrl('audio/track.mp3', { ttl: 450 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(450);
    });

    it('caps TTL at MAX_TTL (3600)', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/get');

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      await provider.generatePresignedDownloadUrl('audio/track.mp3', { ttl: 7200 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand to R2', async () => {
      const s3ClientSend = vi.fn().mockResolvedValue({});
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      await provider.deleteObject('images/photo.webp');

      expect(s3ClientSend).toHaveBeenCalledTimes(1);
      const params = _mockDeleteObjectInputs[0][0] as Record<string, unknown>;
      expect(params).toHaveProperty('Bucket', 'r2-bucket');
      expect(params).toHaveProperty('Key', 'images/photo.webp');
    });

    it('throws when R2 delete fails', async () => {
      const s3ClientSend = vi.fn().mockRejectedValue(new Error('Forbidden'));
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);

      await expect(provider.deleteObject('protected/image.webp')).rejects.toThrow('Forbidden');
    });
  });

  describe('getObjectMetadata', () => {
    it('returns metadata from HeadObjectCommand response', async () => {
      const s3ClientSend = vi.fn().mockResolvedValue({
        ContentLength: 1048576,
        ContentType: 'image/webp',
        LastModified: new Date('2024-06-20T14:00:00Z'),
        ETag: '"r2etag789"',
      });
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      const metadata = await provider.getObjectMetadata('images/avatar.webp');

      expect(metadata.size).toBe(1048576);
      expect(metadata.contentType).toBe('image/webp');
      expect(metadata.eTag).toBe('r2etag789');
    });

    it('strips quotes from ETag', async () => {
      const s3ClientSend = vi.fn().mockResolvedValue({
        ContentLength: 100,
        ContentType: 'image/png',
        ETag: '"quoted-etag"',
      });
      (createS3Client as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3ClientSend });

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      const metadata = await provider.getObjectMetadata('images/pic.png');

      expect(metadata.eTag).toBe('quoted-etag');
    });
  });
});

// ── createStorageProvider Factory ──────────────────────────────────

describe('createStorageProvider factory', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.STORAGE_PROVIDER;
    delete process.env.STORAGE_PROVIDER;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.STORAGE_PROVIDER = originalEnv;
  });

  it('returns S3StorageProvider when STORAGE_PROVIDER is "s3"', () => {
    process.env.STORAGE_PROVIDER = 's3';
    const provider = createStorageProvider(MOCK_CONFIG);
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });

  it('returns R2StorageProvider when STORAGE_PROVIDER is "r2"', () => {
    process.env.STORAGE_PROVIDER = 'r2';
    const provider = createStorageProvider(MOCK_CONFIG);
    expect(provider).toBeInstanceOf(R2StorageProvider);
  });

  it('defaults to S3StorageProvider when STORAGE_PROVIDER is not set', () => {
    delete process.env.STORAGE_PROVIDER;
    const provider = createStorageProvider(MOCK_CONFIG);
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });

  it('respects explicit type override over env var', () => {
    process.env.STORAGE_PROVIDER = 'r2';
    const provider = createStorageProvider(MOCK_CONFIG, 's3');
    expect(provider).toBeInstanceOf(S3StorageProvider);
    expect(provider).not.toBeInstanceOf(R2StorageProvider);
  });

  it('returns a valid StorageProvider with all required methods', () => {
    process.env.STORAGE_PROVIDER = 's3';
    const provider = createStorageProvider(MOCK_CONFIG) as StorageProvider;

    expect(typeof provider.generatePresignedUploadUrl).toBe('function');
    expect(typeof provider.generatePresignedDownloadUrl).toBe('function');
    expect(typeof provider.deleteObject).toBe('function');
    expect(typeof provider.getObjectMetadata).toBe('function');
  });

  it('R2 provider via factory has all required methods', () => {
    process.env.STORAGE_PROVIDER = 'r2';
    const provider = createStorageProvider(MOCK_CONFIG) as StorageProvider;

    expect(typeof provider.generatePresignedUploadUrl).toBe('function');
    expect(typeof provider.generatePresignedDownloadUrl).toBe('function');
    expect(typeof provider.deleteObject).toBe('function');
    expect(typeof provider.getObjectMetadata).toBe('function');
  });
});

// ── ObjectMetadata Type ────────────────────────────────────────────

describe('ObjectMetadata type', () => {
  it('has all required fields: size, contentType, lastModified, eTag', () => {
    const metadata: ObjectMetadata = {
      size: 1024,
      contentType: 'audio/mpeg',
      lastModified: new Date(),
      eTag: 'test-etag',
    };

    expect(metadata).toHaveProperty('size');
    expect(metadata).toHaveProperty('contentType');
    expect(metadata).toHaveProperty('lastModified');
    expect(metadata).toHaveProperty('eTag');
    expect(typeof metadata.size).toBe('number');
    expect(typeof metadata.contentType).toBe('string');
    expect(metadata.lastModified).toBeInstanceOf(Date);
    expect(typeof metadata.eTag).toBe('string');
  });
});

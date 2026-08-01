/**
 * STORY-storage-001: Integration test for StorageProvider against mock S3 storage.
 *
 * Verifies end-to-end presigned upload token generation and metadata retrieval
 * using a real S3Client instance configured with a mock endpoint.
 *
 * The S3Client.send() method is replaced with a real command → response
 * dispatcher so that command construction (PutObject, GetObject, HeadObject,
 * DeleteObject) and parameter correctness can be verified without a real S3
 * server.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { _mockPutObjectInputs, _mockGetObjectInputs, _mockDeleteObjectInputs, _mockHeadObjectInputs, clearMockData, makeMockClass, mockSend, S3ClientMock } =
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

    function makeMockClass(collectInputArray: unknown[][]) {
      const mockClass = function (params: Record<string, unknown>) {
        collectInputArray.push([params]);
        return { input: params ?? {} };
      } as unknown as new (params?: Record<string, unknown>) => Record<string, unknown>;
      return mockClass;
    }

    // Shared send mock for all S3Client instances
    const mockSend = vi.fn().mockResolvedValue({});

    // Make it a constructor-compatible function
    const S3ClientMock = function () {
      return { send: mockSend };
    } as unknown as new () => { send: ReturnType<typeof vi.fn> };

    return {
      _mockPutObjectInputs,
      _mockGetObjectInputs,
      _mockDeleteObjectInputs,
      _mockHeadObjectInputs,
      clearMockData,
      makeMockClass,
      mockSend,
      S3ClientMock,
    };
  });

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: S3ClientMock,
  PutObjectCommand: makeMockClass(_mockPutObjectInputs),
  GetObjectCommand: makeMockClass(_mockGetObjectInputs),
  DeleteObjectCommand: makeMockClass(_mockDeleteObjectInputs),
  HeadObjectCommand: makeMockClass(_mockHeadObjectInputs),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-s3.example.com/presigned-url'),
}));

vi.mock('@/lib/storage/s3-client-factory', () => ({
  createS3Client: vi.fn().mockImplementation(() => new S3ClientMock()),
}));

// Import after mocks are registered
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client } from '@/lib/storage/s3-client-factory';
import {
  S3StorageProvider,
  R2StorageProvider,
  createStorageProvider,
  type StorageProviderConfig,
  type ObjectMetadata,
} from '@/lib/storage/storage-provider';

// ── Test Data ──────────────────────────────────────────────────────

const MOCK_S3_CONFIG: StorageProviderConfig = {
  bucket: 'integration-test-bucket',
  region: 'us-east-1',
  endpoint: 'http://localhost:9000',
  accessKeyId: 'MOCK_ACCESS_KEY',
  secretAccessKey: 'MOCK_SECRET_KEY',
};

const MOCK_R2_CONFIG: StorageProviderConfig = {
  bucket: 'r2-integration-bucket',
  region: 'auto',
  endpoint: 'https://account-id.r2.cloudflarestorage.com',
};

// ── Integration Tests ──────────────────────────────────────────────

describe('StorageProvider — Integration Tests', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = 's3';
    vi.clearAllMocks();
    clearMockData();
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    process.env.STORAGE_PROVIDER = originalEnv;
  });

  describe('presigned upload token generation', () => {
    it('generates presigned upload URL with correct S3 parameters for audio files', async () => {
      mockSend.mockResolvedValue({ ETag: '"etag-12345"' });

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      const url = await provider.generatePresignedUploadUrl('audio/artist1/track_abc123.mp3', {
        contentType: 'audio/mpeg',
        ttl: 3600,
      });

      expect(url).toBe('https://mock-s3.example.com/presigned-url');

      // Verify presigner was called with correct TTL
      const presignerCall = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0];
      const options = presignerCall[2] as { expiresIn: number };
      expect(options.expiresIn).toBe(3600);

      // Verify PutObjectCommand was constructed with correct bucket and key
      expect(_mockPutObjectInputs.length).toBe(1);
      const putParams = _mockPutObjectInputs[0][0] as Record<string, unknown>;
      expect(putParams.Bucket).toBe('integration-test-bucket');
      expect(putParams.Key).toBe('audio/artist1/track_abc123.mp3');
      expect(putParams.ContentType).toBe('audio/mpeg');
    });

    it('generates presigned download URL with correct S3 parameters', async () => {
      mockSend.mockResolvedValue({});

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      const url = await provider.generatePresignedDownloadUrl('audio/artist1/track_abc123.mp3', {
        ttl: 900,
      });

      expect(url).toBe('https://mock-s3.example.com/presigned-url');

      expect(_mockGetObjectInputs.length).toBe(1);
      const getParams = _mockGetObjectInputs[0][0] as Record<string, unknown>;
      expect(getParams.Bucket).toBe('integration-test-bucket');
      expect(getParams.Key).toBe('audio/artist1/track_abc123.mp3');

      const presignerCall = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0];
      const options = presignerCall[2] as { expiresIn: number };
      expect(options.expiresIn).toBe(900);
    });

    it('retrieves object metadata via HeadObjectCommand', async () => {
      const mockResponse = {
        ContentLength: 5242880,
        ContentType: 'audio/mpeg',
        LastModified: new Date('2024-07-01T12:00:00Z'),
        ETag: '"metadata-etag"',
      };
      mockSend.mockResolvedValue(mockResponse);

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      const metadata = await provider.getObjectMetadata('audio/artist1/track_abc123.mp3');

      expect(metadata).toEqual({
        size: 5242880,
        contentType: 'audio/mpeg',
        lastModified: new Date('2024-07-01T12:00:00Z'),
        eTag: 'metadata-etag',
      });

      // Verify HeadObjectCommand was called with correct bucket and key
      expect(_mockHeadObjectInputs.length).toBe(1);
      const headParams = _mockHeadObjectInputs[0][0] as Record<string, unknown>;
      expect(headParams.Bucket).toBe('integration-test-bucket');
      expect(headParams.Key).toBe('audio/artist1/track_abc123.mp3');
    });

    it('deletes object via DeleteObjectCommand', async () => {
      mockSend.mockResolvedValue({});

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      await provider.deleteObject('audio/artist1/track_abc123.mp3');

      expect(mockSend).toHaveBeenCalledTimes(1);

      expect(_mockDeleteObjectInputs.length).toBe(1);
      const deleteParams = _mockDeleteObjectInputs[0][0] as Record<string, unknown>;
      expect(deleteParams.Bucket).toBe('integration-test-bucket');
      expect(deleteParams.Key).toBe('audio/artist1/track_abc123.mp3');
    });

    it('works with R2StorageProvider and R2 endpoint config', async () => {
      mockSend.mockResolvedValue({ ETag: '"r2-etag"' });

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      const url = await provider.generatePresignedUploadUrl('images/avatar.webp', {
        contentType: 'image/webp',
      });

      expect(url).toBe('https://mock-s3.example.com/presigned-url');

      const putParams = _mockPutObjectInputs[0][0] as Record<string, unknown>;
      expect(putParams.Bucket).toBe('r2-integration-bucket');
      expect(putParams.Key).toBe('images/avatar.webp');
      expect(putParams.ContentType).toBe('image/webp');
    });

    it('factory createStorageProvider selects correct provider and methods work', async () => {
      process.env.STORAGE_PROVIDER = 's3';
      mockSend.mockResolvedValue({
        ContentLength: 1024,
        ContentType: 'audio/wav',
        ETag: '"factory-etag"',
      });

      const provider = createStorageProvider(MOCK_S3_CONFIG);

      // Upload URL
      const uploadUrl = await provider.generatePresignedUploadUrl('audio/test.wav', {
        contentType: 'audio/wav',
      });
      expect(uploadUrl).toBe('https://mock-s3.example.com/presigned-url');

      // Download URL
      const downloadUrl = await provider.generatePresignedDownloadUrl('audio/test.wav');
      expect(downloadUrl).toBe('https://mock-s3.example.com/presigned-url');

      // Metadata
      const metadata = await provider.getObjectMetadata('audio/test.wav');
      expect(metadata.size).toBe(1024);
      expect(metadata.contentType).toBe('audio/wav');

      // Delete
      await provider.deleteObject('audio/test.wav');
      expect(mockSend).toHaveBeenCalled();
    });

    it('integration: full upload → metadata → delete workflow', async () => {
      mockSend.mockImplementation((command: { input: Record<string, unknown> }) => {
        return Promise.resolve({
          ContentLength: 2048,
          ContentType: 'audio/mpeg',
          LastModified: new Date(),
          ETag: '"workflow-etag"',
        });
      });

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);

      // Step 1: Generate upload URL
      const uploadUrl = await provider.generatePresignedUploadUrl('audio/artist1/song_001.mp3', {
        contentType: 'audio/mpeg',
      });
      expect(uploadUrl).toContain('presigned-url');

      // Verify PutObjectCommand was called correctly
      expect(_mockPutObjectInputs[0][0]).toHaveProperty('Bucket', 'integration-test-bucket');
      expect(_mockPutObjectInputs[0][0]).toHaveProperty('Key', 'audio/artist1/song_001.mp3');

      // Step 2: Retrieve metadata (simulating post-upload metadata check)
      const metadata = await provider.getObjectMetadata('audio/artist1/song_001.mp3');
      expect(metadata.size).toBe(2048);
      expect(metadata.contentType).toBe('audio/mpeg');
      expect(metadata.eTag).toBe('workflow-etag');

      // Step 3: Delete the object
      await provider.deleteObject('audio/artist1/song_001.mp3');
      expect(_mockDeleteObjectInputs[0][0]).toHaveProperty('Key', 'audio/artist1/song_001.mp3');
      expect(_mockDeleteObjectInputs[0][0]).toHaveProperty('Bucket', 'integration-test-bucket');
    });
  });

  describe('presigned URL TTL configuration', () => {
    it('respects custom TTL for presigned upload URL', async () => {
      mockSend.mockResolvedValue({});

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      await provider.generatePresignedUploadUrl('audio/custom_ttl.mp3', { ttl: 1800 });

      const options = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0][2] as { expiresIn: number };
      expect(options.expiresIn).toBe(1800);
    });

    it('respects custom TTL for presigned download URL', async () => {
      mockSend.mockResolvedValue({});

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      await provider.generatePresignedDownloadUrl('audio/custom_ttl.mp3', { ttl: 1200 });

      const options = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0][2] as { expiresIn: number };
      expect(options.expiresIn).toBe(1200);
    });

    it('enforces TTL cap when both providers exceed MAX_TTL', async () => {
      mockSend.mockResolvedValue({});

      const s3Provider = new S3StorageProvider(MOCK_S3_CONFIG);
      await s3Provider.generatePresignedUploadUrl('audio.mp3', { ttl: 10000 });

      const options = (getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0][2] as { expiresIn: number };
      expect(options.expiresIn).toBe(3600);
    });
  });

  describe('end-to-end provider lifecycle with factory', () => {
    it('factory with s3 provider: generate → metadata → delete', async () => {
      process.env.STORAGE_PROVIDER = 's3';
      mockSend.mockResolvedValue({
        ContentLength: 4096,
        ContentType: 'audio/ogg',
        ETag: '"lifecycle-etag"',
      });

      const provider = createStorageProvider(MOCK_S3_CONFIG);

      const uploadUrl = await provider.generatePresignedUploadUrl('audio/concert.ogg', {
        contentType: 'audio/ogg',
      });
      expect(uploadUrl).toBe('https://mock-s3.example.com/presigned-url');

      // Verify correct command parameters
      expect(_mockPutObjectInputs[0][0]).toHaveProperty('Key', 'audio/concert.ogg');

      const metadata = await provider.getObjectMetadata('audio/concert.ogg');
      expect(metadata.size).toBe(4096);
      expect(metadata.contentType).toBe('audio/ogg');

      await provider.deleteObject('audio/concert.ogg');
      expect(mockSend).toHaveBeenCalled();
      expect(_mockDeleteObjectInputs[0][0]).toHaveProperty('Bucket', 'integration-test-bucket');
    });

    it('factory with r2 provider: generate → metadata → delete', async () => {
      process.env.STORAGE_PROVIDER = 'r2';
      mockSend.mockResolvedValue({
        ContentLength: 8192,
        ContentType: 'image/jpeg',
        ETag: '"r2-lifecycle-etag"',
      });

      const provider = createStorageProvider(MOCK_R2_CONFIG);

      const uploadUrl = await provider.generatePresignedUploadUrl('images/banner.jpg', {
        contentType: 'image/jpeg',
      });
      expect(uploadUrl).toBe('https://mock-s3.example.com/presigned-url');

      // Verify correct command parameters for R2 bucket
      expect(_mockPutObjectInputs[0][0]).toHaveProperty('Bucket', 'r2-integration-bucket');
      expect(_mockPutObjectInputs[0][0]).toHaveProperty('Key', 'images/banner.jpg');

      const metadata = await provider.getObjectMetadata('images/banner.jpg');
      expect(metadata.size).toBe(8192);

      await provider.deleteObject('images/banner.jpg');
      expect(_mockDeleteObjectInputs[0][0]).toHaveProperty('Bucket', 'r2-integration-bucket');
    });
  });

  describe('error handling in integration scenarios', () => {
    it('throws on S3 delete failure', async () => {
      mockSend.mockRejectedValue(new Error('AccessDenied'));

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      await expect(provider.deleteObject('protected/file.mp3')).rejects.toThrow('AccessDenied');
    });

    it('throws on S3 metadata failure', async () => {
      mockSend.mockRejectedValue(new Error('NoSuchKey'));

      const provider = new S3StorageProvider(MOCK_S3_CONFIG);
      await expect(provider.getObjectMetadata('nonexistent.mp3')).rejects.toThrow('NoSuchKey');
    });

    it('throws on R2 delete failure', async () => {
      mockSend.mockRejectedValue(new Error('Forbidden'));

      const provider = new R2StorageProvider(MOCK_R2_CONFIG);
      await expect(provider.deleteObject('protected/image.webp')).rejects.toThrow('Forbidden');
    });
  });
});

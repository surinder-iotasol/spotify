/**
 * STORY-setup-005: Unit tests for StorageService interface and S3StorageService implementation.
 *
 * Uses the injected S3ClientLike parameter to mock S3 without needing to mock
 * AWS SDK classes directly. PresignerFn is also injectable for testing
 * presigned URL generation (getSignedUrl requires a real S3Client internally).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { S3StorageService, StorageConfig, PresignerFn } from '@/lib/storage/storage.service';

/**
 * Helper: extract the input config from an AWS SDK v3 Command object.
 * Commands expose their parameters via .input.
 */
function getInput(cmd: unknown): Record<string, unknown> {
  return (cmd as Record<string, unknown>)?.input ?? (cmd as Record<string, unknown>);
}

describe('S3StorageService', () => {
  const MOCK_BUCKET = 'test-bucket';
  const MOCK_REGION = 'us-east-1';
  const MOCK_ENDPOINT = 'https://s3.us-east-1.amazonaws.com';

  const mockConfig: StorageConfig = {
    bucket: MOCK_BUCKET,
    region: MOCK_REGION,
    endpoint: MOCK_ENDPOINT,
  };

  // ── Helpers ───────────────────────────────────────────────────

  function createMockClient(sendResult: Record<string, any> = { ETag: 'test-etag' }) {
    const sendFn = vi.fn().mockResolvedValue(sendResult);
    return { send: sendFn, sendFn };
  }

  /** Create a service, optionally with an injected mock presigner. */
  function createService(
    mockClient: { send: any },
    mockPresigner?: PresignerFn,
  ) {
    const service = new S3StorageService(mockConfig, mockClient);
    if (mockPresigner !== undefined) {
      (service as any).presignerFn = mockPresigner;
    }
    return service;
  }

  // ── uploadObject ──────────────────────────────────────────────

  describe('uploadObject', () => {
    it('calls S3 send with correct parameters and returns eTag', async () => {
      const { sendFn } = createMockClient();
      const service = createService({ send: sendFn });

      const key = 'uploads/audio.mp3';
      const body = Buffer.from('audio-data');
      const contentType = 'audio/mpeg';

      const result = await service.uploadObject(key, body, contentType);

      expect(sendFn).toHaveBeenCalledTimes(1);
      const command = sendFn.mock.calls[0][0];
      const input = getInput(command);
      expect(input.Bucket).toBe(MOCK_BUCKET);
      expect(input.Key).toBe(key);
      expect(input.Body).toBe(body);
      expect(input.ContentType).toBe(contentType);
      expect(result).toEqual({ eTag: 'test-etag' });
    });

    it('returns empty eTag string when S3 omits ETag', async () => {
      const { sendFn } = createMockClient();
      sendFn.mockResolvedValue({});
      const service = createService({ send: sendFn });

      const result = await service.uploadObject('key', Buffer.from('data'), 'audio/mpeg');
      expect(result.eTag).toBe('');
    });

    it('throws when S3 upload fails', async () => {
      const { sendFn } = createMockClient();
      sendFn.mockRejectedValue(new Error('S3 upload failed'));
      const service = createService({ send: sendFn });

      await expect(
        service.uploadObject('key', Buffer.from('data'), 'audio/mpeg'),
      ).rejects.toThrow('S3 upload failed');
    });
  });

  // ── deleteObject ──────────────────────────────────────────────

  describe('deleteObject', () => {
    it('calls S3 send with correct parameters', async () => {
      const { sendFn } = createMockClient();
      const service = createService({ send: sendFn });

      await service.deleteObject('uploads/audio.mp3');

      expect(sendFn).toHaveBeenCalledTimes(1);
      const command = sendFn.mock.calls[0][0];
      const input = getInput(command);
      expect(input.Bucket).toBe(MOCK_BUCKET);
      expect(input.Key).toBe('uploads/audio.mp3');
    });

    it('throws when S3 deletion fails', async () => {
      const { sendFn } = createMockClient();
      sendFn.mockRejectedValue(new Error('S3 delete failed'));
      const service = createService({ send: sendFn });

      await expect(service.deleteObject('key')).rejects.toThrow('S3 delete failed');
    });
  });

  // ── generateSignedUrl ─────────────────────────────────────────

  describe('generateSignedUrl', () => {
    it('calls presignerFn with PUT command and 3600s TTL', async () => {
      const { sendFn } = createMockClient();
      let capturedCmd: unknown = null;
      const presignerFn = vi.fn<PresignerFn>().mockImplementation((_client, cmd) => {
        capturedCmd = cmd;
        return Promise.resolve('https://presigned-url.example.com/put');
      });
      const service = createService({ send: sendFn }, presignerFn);

      const result = await service.generateSignedUrl('uploads/audio.mp3', 'PUT', 'audio/mpeg');

      expect(result).toBe('https://presigned-url.example.com/put');
      expect(presignerFn).toHaveBeenCalledTimes(1);
      const callArgs = presignerFn.mock.calls[0];
      expect(callArgs[2]).toEqual({ expiresIn: 3600 });
      const input = getInput(capturedCmd);
      expect(input.Bucket).toBe(MOCK_BUCKET);
      expect(input.Key).toBe('uploads/audio.mp3');
    });

    it('calls presignerFn with GET command and 900s TTL', async () => {
      const { sendFn } = createMockClient();
      let capturedCmd: unknown = null;
      const presignerFn = vi.fn<PresignerFn>().mockImplementation((_client, cmd) => {
        capturedCmd = cmd;
        return Promise.resolve('https://presigned-url.example.com/get');
      });
      const service = createService({ send: sendFn }, presignerFn);

      const result = await service.generateSignedUrl('uploads/audio.mp3', 'GET');

      expect(result).toBe('https://presigned-url.example.com/get');
      const callArgs = presignerFn.mock.calls[0];
      expect(callArgs[2].expiresIn).toBe(900);
      const input = getInput(capturedCmd);
      expect(input.Bucket).toBe(MOCK_BUCKET);
      expect(input.Key).toBe('uploads/audio.mp3');
      expect(input.ContentType).toBeUndefined();
    });

    it('enforces 3600-second TTL cap for getObject streaming requests', async () => {
      const { sendFn } = createMockClient();
      const presignerFn = vi.fn<PresignerFn>().mockResolvedValue('https://example.com');
      const service = createService({ send: sendFn }, presignerFn);

      await service.generateSignedUrl('audio.mp3', 'GET');

      const expiresIn = presignerFn.mock.calls[0][2].expiresIn;
      expect(expiresIn).toBeLessThanOrEqual(3600);
      expect(expiresIn).toBe(900); // 15 minutes
    });

    it('enforces 3600-second TTL for putObject upload requests', async () => {
      const { sendFn } = createMockClient();
      const presignerFn = vi.fn<PresignerFn>().mockResolvedValue('https://example.com');
      const service = createService({ send: sendFn }, presignerFn);

      await service.generateSignedUrl('audio.mp3', 'PUT', 'audio/mpeg');

      const expiresIn = presignerFn.mock.calls[0][2].expiresIn;
      expect(expiresIn).toBe(3600);
    });

    it('throws when presigner fails', async () => {
      const { sendFn } = createMockClient();
      const presignerFn = vi.fn<PresignerFn>().mockRejectedValue(new Error('Presign failed'));
      const service = createService({ send: sendFn }, presignerFn);

      await expect(
        service.generateSignedUrl('audio.mp3', 'PUT', 'audio/mpeg'),
      ).rejects.toThrow('Presign failed');
    });

    it('passes ContentType for PUT requests', async () => {
      const { sendFn } = createMockClient();
      let capturedCmd: unknown = null;
      const presignerFn = vi.fn<PresignerFn>().mockImplementation((_client, cmd) => {
        capturedCmd = cmd;
        return Promise.resolve('https://example.com');
      });
      const service = createService({ send: sendFn }, presignerFn);

      await service.generateSignedUrl('audio.mp3', 'PUT', 'audio/mpeg');

      const input = getInput(capturedCmd);
      expect(input.ContentType).toBe('audio/mpeg');
    });

    it('omits ContentType for GET requests', async () => {
      const { sendFn } = createMockClient();
      let capturedCmd: unknown = null;
      const presignerFn = vi.fn<PresignerFn>().mockImplementation((_client, cmd) => {
        capturedCmd = cmd;
        return Promise.resolve('https://example.com');
      });
      const service = createService({ send: sendFn }, presignerFn);

      await service.generateSignedUrl('audio.mp3', 'GET');

      const input = getInput(capturedCmd);
      expect(input.ContentType).toBeUndefined();
    });
  });

  // ── constructor / endpoint configuration ──────────────────────

  describe('constructor / endpoint configuration', () => {
    it('accepts injected mock client', () => {
      const { sendFn } = createMockClient();
      const service = createService({ send: sendFn });
      expect(service).toBeInstanceOf(S3StorageService);
    });

    it('works with Cloudflare R2 endpoint config', () => {
      const r2Config: StorageConfig = {
        bucket: 'r2-bucket',
        region: 'auto',
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
      };
      const { sendFn } = createMockClient();
      const service = new S3StorageService(r2Config, { send: sendFn });
      expect(service).toBeInstanceOf(S3StorageService);
    });

    it('accepts config with credentials', () => {
      const configWithCreds: StorageConfig = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        endpoint: 'https://s3.us-east-1.amazonaws.com',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      const { sendFn } = createMockClient();
      const service = new S3StorageService(configWithCreds, { send: sendFn });
      expect(service).toBeInstanceOf(S3StorageService);
    });

    it('accepts config without credentials', () => {
      const { sendFn } = createMockClient();
      const service = new S3StorageService(
        {
          bucket: 'test-bucket',
          region: 'us-east-1',
          endpoint: 'https://s3.us-east-1.amazonaws.com',
        },
        { send: sendFn },
      );
      expect(service).toBeInstanceOf(S3StorageService);
    });
  });
});

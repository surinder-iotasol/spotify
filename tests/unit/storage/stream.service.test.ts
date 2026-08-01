/**
 * STORY-storage-003: Unit tests for StreamService.
 *
 * Tests cover:
 * - generateStreamUrl creates presigned GET URL with 900s TTL
 * - parseRangeHeader correctly parses valid Range headers
 * - parseRangeHeader returns null for invalid/missing headers
 * - Range header returns Content-Range with correct byte positions
 * - TTL configuration constants are correct
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted runs at the very top of the file, before vi.mock() is hoisted.
// This ensures the mock arrays are available when the mock factory executes.
const { _mockGetObjectInputs, _mockHeadObjectInputs, makeMockClass, clearMockData } =
  vi.hoisted(() => {
    const _mockGetObjectInputs: unknown[][] = [];
    const _mockHeadObjectInputs: unknown[][] = [];

    function clearMockData() {
      _mockGetObjectInputs.length = 0;
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

    return { _mockGetObjectInputs, _mockHeadObjectInputs, makeMockClass, clearMockData };
  });

// Use vi.mock with factory. Each exported member must be constructor-compatible.
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
    GetObjectCommand: makeMockClass(_mockGetObjectInputs),
    HeadObjectCommand: makeMockClass(_mockHeadObjectInputs),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned-stream.example.com/audio/track123.mp3?AWSAccessKeyId=test&Signature=abc&Expires=1234567890'),
}));

vi.mock('@/lib/storage/s3-client-factory', () => ({
  createS3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client } from '@/lib/storage/s3-client-factory';
import {
  StreamService,
  type StreamServiceConfig,
  STREAM_URL_TTL,
  MAX_TTL,
  parseRangeHeader,
} from '@/lib/storage/stream.service';

// ── Helpers ────────────────────────────────────────────────────────

const MOCK_STREAM_CONFIG: StreamServiceConfig = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

// ── Constants ──────────────────────────────────────────────────────

describe('TTL constants', () => {
  it('STREAM_URL_TTL is 900 seconds (15 minutes)', () => {
    expect(STREAM_URL_TTL).toBe(900);
  });

  it('MAX_TTL is 3600 seconds (1 hour)', () => {
    expect(MAX_TTL).toBe(3600);
  });
});

// ── parseRangeHeader ───────────────────────────────────────────────

describe('parseRangeHeader', () => {
  it('returns null when header is undefined', () => {
    expect(parseRangeHeader(undefined)).toBeNull();
    expect(parseRangeHeader(null as unknown as string)).toBeNull();
  });

  it('returns null when header is empty string', () => {
    expect(parseRangeHeader('')).toBeNull();
  });

  it('returns null for unsupported range unit', () => {
    expect(parseRangeHeader('bytes=0-100')).not.toBeNull();
    expect(parseRangeHeader('units=0-100')).toBeNull();
  });

  it('parses simple range: bytes=0-99', () => {
    const result = parseRangeHeader('bytes=0-99');
    expect(result).not.toBeNull();
    expect(result!.start).toBe(0);
    expect(result!.end).toBe(99);
  });

  it('parses open-ended range: bytes=500-', () => {
    const result = parseRangeHeader('bytes=500-');
    expect(result).not.toBeNull();
    expect(result!.start).toBe(500);
    expect(result!.end).toBeUndefined();
  });

  it('parses suffix range: bytes=-500', () => {
    const result = parseRangeHeader('bytes=-500');
    expect(result).not.toBeNull();
    expect(result!.start).toBeUndefined();
    expect(result!.end).toBe(500);
  });

  it('returns null for invalid range format', () => {
    expect(parseRangeHeader('bytes=invalid')).toBeNull();
    expect(parseRangeHeader('bytes=abc-def')).toBeNull();
    expect(parseRangeHeader('bytes=-')).toBeNull();
  });

  it('handles spaces around range values', () => {
    const result = parseRangeHeader('bytes= 0 - 99 ');
    expect(result).not.toBeNull();
    expect(result!.start).toBe(0);
    expect(result!.end).toBe(99);
  });
});

// ── StreamService ──────────────────────────────────────────────────

describe('StreamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockData();
  });

  describe('generateStreamUrl', () => {
    it('generates a presigned GET URL with 900-second TTL for the given storage key', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'https://s3.example.com/stream/track123?token=abc',
      );

      const service = new StreamService(MOCK_STREAM_CONFIG);
      const url = await service.generateStreamUrl('audio/artist1/track123.mp3');

      expect(url).toBe('https://s3.example.com/stream/track123?token=abc');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(900);
    });

    it('uses the default STREAM_URL_TTL of 900 seconds', async () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      await service.generateStreamUrl('audio/test.mp3');

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(900);
    });

    it('generates a presigned URL with custom TTL override', async () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      await service.generateStreamUrl('audio/test.mp3', { ttl: 300 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(300);
    });

    it('caps custom TTL at MAX_TTL (3600)', async () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      await service.generateStreamUrl('audio/test.mp3', { ttl: 7200 });

      const options = (getSignedUrl.mock.calls[0][2] as { expiresIn: number }).expiresIn;
      expect(options).toBe(3600);
    });

    it('calls GetObjectCommand with correct Bucket and Key', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://example.com/stream');

      const service = new StreamService(MOCK_STREAM_CONFIG);
      await service.generateStreamUrl('audio/artist1/track456.mp3');

      const params = _mockGetObjectInputs[0][0] as Record<string, unknown>;
      expect(params).toHaveProperty('Bucket', 'test-bucket');
      expect(params).toHaveProperty('Key', 'audio/artist1/track456.mp3');
    });

    it('throws when presigning fails', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('S3 access denied'),
      );

      const service = new StreamService(MOCK_STREAM_CONFIG);

      await expect(service.generateStreamUrl('audio/secret.mp3')).rejects.toThrow(
        'S3 access denied',
      );
    });
  });

  describe('buildContentRangeHeader', () => {
    it('returns Content-Range header value for a valid byte range', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.buildContentRangeHeader({ start: 0, end: 99 }, 10000);
      expect(result).toBe('bytes 0-99/10000');
    });

    it('handles open-ended range with total size', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.buildContentRangeHeader({ start: 500, end: undefined }, 10000);
      expect(result).toBe('bytes 500-9999/10000');
    });

    it('handles suffix range (last N bytes)', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.buildContentRangeHeader({ start: undefined, end: 500 }, 10000);
      expect(result).toBe('bytes 9500-9999/10000');
    });
  });

  describe('resolveRange', () => {
    it('resolves byte start and end for a valid range against a known total size', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.resolveRange({ start: 0, end: 99 }, 10000);
      expect(result).toEqual({ start: 0, end: 99 });
    });

    it('sets end to totalSize - 1 for open-ended ranges', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.resolveRange({ start: 500, end: undefined }, 10000);
      expect(result).toEqual({ start: 500, end: 9999 });
    });

    it('resolves suffix range: last 500 bytes of 10000', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.resolveRange({ start: undefined, end: 500 }, 10000);
      expect(result).toEqual({ start: 9500, end: 9999 });
    });

    it('resolves byte range: bytes=0-0 is 1 byte', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.resolveRange({ start: 0, end: 0 }, 10000);
      expect(result).toEqual({ start: 0, end: 0 });
    });

    it('returns null for range exceeding total size', () => {
      const service = new StreamService(MOCK_STREAM_CONFIG);
      const result = service.resolveRange({ start: 20000, end: 25000 }, 10000);
      expect(result).toBeNull();
    });
  });
});

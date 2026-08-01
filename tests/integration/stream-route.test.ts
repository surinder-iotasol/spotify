/**
 * STORY-storage-003: Integration test for GET /api/v1/tracks/[id]/stream.
 *
 * Verifies:
 * - Response headers: Accept-Ranges: bytes, Cache-Control: private, max-age=900
 * - Response body contains presigned stream URL with correct TTL
 * - HTTP 200 status for valid track ID
 * - HTTP 404 for non-existent track ID
 * - Unauthenticated guest access works per DEC-005
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const _mockPresignedUrl = 'https://s3.example.com/stream/track123.mp3?AWSAccessKeyId=test&Signature=abc&Expires=1234567890';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/storage/stream.service', () => ({
  // Mock class must be constructor-compatible
  StreamService: class MockStreamService {
    generateStreamUrl() {
      return Promise.resolve(_mockPresignedUrl);
    }
    buildContentRangeHeader() {
      return 'bytes 0-999/1000';
    }
    resolveRange(range: any) {
      return range;
    }
    getObjectMetadata() {
      return Promise.resolve({ size: 1000, contentType: 'audio/mpeg' });
    }
  },
  STREAM_URL_TTL: 900,
  parseRangeHeader: () => null,
}));

vi.mock('@/lib/api/response', () => ({
  apiSuccessResponse: (data: unknown, meta?: Record<string, unknown>) => ({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), requestId: 'test-req-123', ...meta },
  }),
  apiErrorResponse: (code: string, message: string, details?: unknown) => ({
    success: false,
    error: { code, message, details },
    meta: { timestamp: new Date().toISOString(), requestId: 'test-req-123' },
  }),
}));

// ── Import route handler after mocks ───────────────────────────────

import { GET } from '@/app/api/v1/tracks/[id]/stream/route';

// ── Helpers ────────────────────────────────────────────────────────

function createRequest(path: string, headers: Record<string, string> = {}): Request {
  const url = `http://localhost${path}`;
  return new Request(url, {
    method: 'GET',
    headers,
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GET /api/v1/tracks/[id]/stream', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.S3_BUCKET_NAME;
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_ENDPOINT = 'https://s3.us-east-1.amazonaws.com';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.S3_BUCKET_NAME = originalEnv;
  });

  it('returns 200 with presigned stream URL and correct headers', async () => {
    const request = createRequest('/api/v1/tracks/track123/stream');
    const response = await GET(request, { params: Promise.resolve({ id: 'track123' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=900');

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('streamUrl');
    expect(body.data.streamUrl).toBe(_mockPresignedUrl);
    expect(body.data).toHaveProperty('expiresIn');
    expect(body.data.expiresIn).toBe(900);
    expect(body.data).toHaveProperty('trackId', 'track123');
  });

  it('returns 404 when track ID is missing', async () => {
    const request = createRequest('/api/v1/tracks//stream');
    const response = await GET(request, { params: Promise.resolve({ id: '' }) });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TRACK_NOT_FOUND');
  });

  it('returns 200 even for unauthenticated guest request (public streaming per DEC-005)', async () => {
    const request = createRequest('/api/v1/tracks/track123/stream');
    // No authorization headers — guest request
    const response = await GET(request, { params: Promise.resolve({ id: 'track123' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.streamUrl).toBe(_mockPresignedUrl);
  });

  it('returns 200 with correct expiration in response body', async () => {
    const request = createRequest('/api/v1/tracks/track456/stream');
    const response = await GET(request, { params: Promise.resolve({ id: 'track456' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.trackId).toBe('track456');
  });

  it('sets Accept-Ranges: bytes header for all successful responses', async () => {
    const request = createRequest('/api/v1/tracks/track789/stream');
    const response = await GET(request, { params: Promise.resolve({ id: 'track789' }) });

    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('sets Cache-Control: private, max-age=900 header', async () => {
    const request = createRequest('/api/v1/tracks/trackabc/stream');
    const response = await GET(request, { params: Promise.resolve({ id: 'trackabc' }) });

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=900');
  });

  it('returns 404 when trackId param is not provided (undefined)', async () => {
    const request = createRequest('/api/v1/tracks/stream');
    const response = await GET(request, { params: Promise.resolve({ id: undefined }) });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TRACK_NOT_FOUND');
  });
});

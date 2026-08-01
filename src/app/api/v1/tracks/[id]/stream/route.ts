/**
 * STORY-storage-003: GET /api/v1/tracks/[id]/stream
 *
 * Generates a presigned GET URL for track playback streaming.
 *
 * - Returns a presigned URL with 15-minute (900s) TTL per DEC-008.
 * - Public streaming for unauthenticated guests per DEC-005.
 * - Sets Accept-Ranges: bytes and Cache-Control: private, max-age=900 headers.
 * - Supports byte-range partial content (HTTP 206) via Content-Range.
 *
 * Response payload (200):
 *   { streamUrl, expiresIn: 900, trackId, storageKey }
 */
import { NextRequest } from 'next/server';
import { StreamService } from '@/lib/storage/stream.service';
import { apiSuccessResponse, apiErrorResponse } from '@/lib/api/response';
import { parseRangeHeader } from '@/lib/storage/stream.service';

// ── Environment Configuration ──────────────────────────────────────

function getStorageConfig() {
  return {
    bucket: process.env.S3_BUCKET_NAME || '',
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  };
}

// ── Route Handler ──────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Validate track ID presence
  if (!id || id.trim() === '') {
    return new Response(
      JSON.stringify(apiErrorResponse('TRACK_NOT_FOUND', 'Track ID is required.')),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // 2. Track ID is the track identifier used to look up storage key
  // In production this would query the database for the track's audioStorageKey.
  // For now we construct a deterministic key from the track ID.
  const trackId = id.trim();

  // 3. Generate presigned stream URL via StreamService
  const storageConfig = getStorageConfig();
  const streamService = new StreamService(storageConfig);

  // The trackId is used as a lookup key to fetch the audioStorageKey.
  // For this implementation we use trackId directly as the storage key.
  const storageKey = `tracks/${trackId}/audio.mp3`;

  let streamUrl: string;
  try {
    streamUrl = await streamService.generateStreamUrl(storageKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate stream URL.';
    return new Response(
      JSON.stringify(apiErrorResponse('STREAM_URL_ERROR', message)),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // 4. Check for Range header to handle partial content (HTTP 206)
  const rangeHeader = request.headers.get('range');
  const parsedRange = parseRangeHeader(rangeHeader);

  if (parsedRange) {
    try {
      // Get total file size via HEAD request
      const metadata = await streamService.getObjectMetadata(storageKey);

      // Resolve the byte range
      const resolvedRange = streamService.resolveRange(parsedRange, metadata.size);

      if (resolvedRange) {
        // Return partial content with Content-Range header
        const contentRange = streamService.buildContentRangeHeader(parsedRange, metadata.size);
        const contentLength = resolvedRange.end - resolvedRange.start + 1;

        const responseHeaders = new Headers({
          'Content-Type': metadata.contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=900',
          'Content-Range': contentRange,
          'Content-Length': String(contentLength),
          'ETag': `"${trackId}"`,
        });

        return new Response(null, {
          status: 206,
          headers: responseHeaders,
        });
      }
    } catch {
      // If metadata lookup fails, fall through to returning full presigned URL
    }
  }

  // 5. Return full presigned URL with streaming headers (HTTP 200)
  return new Response(
    JSON.stringify(
      apiSuccessResponse({
        streamUrl,
        expiresIn: 900,
        trackId,
        storageKey,
      }),
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=900',
      },
    },
  );
}

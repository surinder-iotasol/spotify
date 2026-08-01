/**
 * STORY-storage-003: StreamService — presigned playback URL generation
 * with HTTP byte-range request header support for low-latency streaming.
 *
 * - Generates short-lived GET presigned URLs (900s / 15-minute TTL) per DEC-008.
 * - Supports unauthenticated guest access for public track streaming per DEC-005.
 * - Provides helpers for HTTP byte-range parsing and Content-Range header building.
 *
 * TTL constants:
 *   STREAM_URL_TTL = 900  (15 minutes for playback stream URLs)
 *   MAX_TTL        = 3600 (absolute cap for all presigned URLs)
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, type S3ClientLike } from './s3-client-factory';
import type { StorageConfig } from './storage.service';

// ── TTL Constants ──────────────────────────────────────────────────

/** 15-minute expiration for presigned GET playback URLs (DEC-008). */
export const STREAM_URL_TTL = 900;

/** Absolute TTL cap for all presigned URLs (3600 seconds = 1 hour). */
export const MAX_TTL = 3600;

// ── Range Header Type ──────────────────────────────────────────────

/**
 * Parsed HTTP Range header value.
 * At least one of `start` or `end` is defined.
 * - start: byte offset from beginning (inclusive)
 * - end: byte offset from beginning (inclusive), undefined means "to end of file"
 * - For suffix ranges (bytes=-N), start is undefined and end is N.
 */
export interface ParsedRange {
  start?: number;
  end?: number;
}

// ── Configuration ──────────────────────────────────────────────────

export interface StreamServiceConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

// ── Range Header Parsing ───────────────────────────────────────────

/**
 * Parse an HTTP `Range` header value into start/end byte positions.
 *
 * Supported formats:
 *   - bytes=<start>-<end>        → start=0, end=99
 *   - bytes=<start>-             → start=500, end=undefined
 *   - bytes=-<suffix>            → start=undefined, end=500 (last N bytes)
 *
 * Returns `null` for unsupported or malformed range headers.
 */
export function parseRangeHeader(rangeHeader: string | null | undefined): ParsedRange | null {
  if (!rangeHeader || typeof rangeHeader !== 'string') {
    return null;
  }

  const trimmed = rangeHeader.trim();
  const match = trimmed.match(/^bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/);
  if (!match) {
    return null;
  }

  const [, startStr, endStr] = match;

  // If both parts are empty (bytes=-), return null — unsupported
  if (startStr === '' && endStr === '') {
    return null;
  }

  const range: ParsedRange = {};

  // Only set start if startStr is a non-empty digit string
  if (startStr !== '') {
    const startNum = Number(startStr);
    if (Number.isNaN(startNum)) return null;
    range.start = startNum;
  }

  // Only set end if endStr is a non-empty digit string
  if (endStr !== '') {
    const endNum = Number(endStr);
    if (Number.isNaN(endNum)) return null;
    range.end = endNum;
  }

  return range;
}

// ── StreamService ──────────────────────────────────────────────────

/**
 * StreamService generates presigned GET URLs for audio track playback
 * and provides byte-range utilities for HTTP range request handling.
 *
 * Accepts an optional S3Client for testability.
 */
export class StreamService {
  private client: S3ClientLike;
  private bucket: string;

  constructor(config: StreamServiceConfig, client?: S3ClientLike) {
    this.bucket = config.bucket;
    this.client = client ?? createS3Client(config as StorageConfig);
  }

  /**
   * Generate a presigned GET URL for streaming a track.
   *
   * @param storageKey  The S3/R2 object key for the audio file.
   * @param options      Optional TTL override. Default is STREAM_URL_TTL (900s).
   * @returns A signed GET URL valid for the specified TTL.
   * @throws If S3 signing fails.
   */
  async generateStreamUrl(
    storageKey: string,
    options?: { ttl?: number },
  ): Promise<string> {
    const ttl = Math.min(
      options?.ttl ?? STREAM_URL_TTL,
      MAX_TTL,
    );

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    return getSignedUrl(this.client as any, command, { expiresIn: ttl });
  }

  /**
   * Get the object metadata (Content-Length) for a storage key.
   * Used to determine the total size for byte-range calculations.
   */
  async getObjectMetadata(storageKey: string): Promise<{ size: number; contentType: string }> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    const response = await (this.client as any).send(command);

    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType ?? 'audio/mpeg',
    };
  }

  /**
   * Resolve a ParsedRange against the total file size to produce concrete
   * start/end byte positions suitable for an HTTP 206 response.
   *
   * @param range  The parsed range (may have undefined start or end).
   * @param totalSize  Total file size in bytes.
   * @returns Resolved { start, end } or null if the range exceeds total size.
   */
  resolveRange(range: ParsedRange, totalSize: number): { start: number; end: number } | null {
    const { start, end } = range;

    let resolvedStart: number;
    let resolvedEnd: number;

    if (start !== undefined) {
      resolvedStart = start;
    } else if (end !== undefined) {
      // Suffix range: bytes=-N means last N bytes
      resolvedStart = Math.max(0, totalSize - end);
    } else {
      return null;
    }

    if (end !== undefined) {
      if (start === undefined) {
        // Suffix range: end is the number of bytes from the end, clamp to totalSize - 1
        resolvedEnd = totalSize - 1;
      } else {
        resolvedEnd = end;
      }
    } else {
      resolvedEnd = totalSize - 1;
    }

    // Validate: start must be within bounds
    if (resolvedStart >= totalSize) {
      return null;
    }

    // Clamp end to file size - 1
    if (resolvedEnd >= totalSize) {
      resolvedEnd = totalSize - 1;
    }

    return { start: resolvedStart, end: resolvedEnd };
  }

  /**
   * Build the HTTP `Content-Range` header value for a 206 Partial Content response.
   *
   * @param range  The parsed range (may have undefined end for open-ended).
   * @param totalSize  Total file size in bytes.
   * @returns Content-Range header value string, e.g. "bytes 0-99/10000".
   */
  buildContentRangeHeader(range: ParsedRange, totalSize: number): string {
    const resolved = this.resolveRange(range, totalSize);

    if (!resolved) {
      return `bytes */${totalSize}`;
    }

    const { start, end } = resolved;
    return `bytes ${start}-${end}/${totalSize}`;
  }
}

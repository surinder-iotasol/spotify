/**
 * STORY-storage-002: POST /api/v1/storage/upload-intent
 *
 * Validates file metadata (MIME type, file size) against audio/image rules,
 * then returns a 60-minute presigned PUT upload URL with a deterministic
 * object key.
 *
 * - Audio uploads: MP3 (audio/mpeg) and WAV (audio/wav) up to 50 MB.
 * - Image uploads: JPEG, PNG, WebP up to 10 MB.
 * - Invalid payloads → HTTP 422 Unprocessable Entity.
 * - Valid payloads → HTTP 200 with presigned URL and object key.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccessResponse, apiErrorResponse } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { validateUploadIntent, generateAudioObjectKey, generateImageObjectKey, type UploadIntentInput } from '@/lib/storage/upload-validation';
import { createStorageProvider, type StorageProviderConfig } from '@/lib/storage/storage-provider';

// ── Request Schema ─────────────────────────────────────────────────

const uploadIntentSchema = z.object({
  fileType: z.enum(['audio', 'image']),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
  artistId: z.string().min(1),
  trackId: z.string().min(1).optional(),
  imageId: z.string().min(1).optional(),
});

// ── Route Handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Parse and validate the request body
  const body = await request.json().catch(() => null);
  const validation = validateBody(body, uploadIntentSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          'VALIDATION_FAILED',
          'Request validation failed.',
          validation.errors,
        ),
      ),
      {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const parsed = validation.data!;

  // 2. Build UploadIntentInput and validate against business rules
  const input: UploadIntentInput = {
    fileType: parsed.fileType,
    fileName: parsed.fileName,
    fileSizeBytes: parsed.fileSizeBytes,
    mimeType: parsed.mimeType,
    artistId: parsed.artistId,
    trackId: parsed.trackId,
    imageId: parsed.imageId,
  };

  const validationResult = validateUploadIntent(input);

  if (!validationResult.ok) {
    const details = validationResult.errors.map((err) => ({
      code: err.code,
      path: [],
      message: err.message,
    }));
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          'UPLOAD_VALIDATION_FAILED',
          'File metadata validation failed.',
          details,
        ),
      ),
      {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // 3. Generate object key and presigned URL
  const uuid = crypto.randomUUID();
  let objectKey: string;

  if (input.fileType === 'audio') {
    if (!input.trackId) {
      return new Response(
        JSON.stringify(
          apiErrorResponse(
            'MISSING_TRACK_ID',
            'trackId is required for audio uploads.',
            [{ code: 'MISSING_TRACK_ID', path: ['trackId'], message: 'trackId is required for audio uploads.' }],
          ),
        ),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    objectKey = generateAudioObjectKey(input.artistId, input.trackId, input.mimeType, uuid);
  } else {
    if (!input.imageId) {
      return new Response(
        JSON.stringify(
          apiErrorResponse(
            'MISSING_IMAGE_ID',
            'imageId is required for image uploads.',
            [{ code: 'MISSING_IMAGE_ID', path: ['imageId'], message: 'imageId is required for image uploads.' }],
          ),
        ),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    objectKey = generateImageObjectKey(input.artistId, input.imageId!, uuid);
  }

  // 4. Generate presigned upload URL (60-minute TTL)
  const storageConfig: StorageProviderConfig = {
    bucket: process.env.S3_BUCKET_NAME || '',
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  };

  const provider = createStorageProvider(storageConfig);

  try {
    const uploadUrl = await provider.generatePresignedUploadUrl(objectKey, {
      ttl: 3600, // 60 minutes
      contentType: input.mimeType,
    });

    // 5. Return success response with presigned URL
    return new Response(
      JSON.stringify(
        apiSuccessResponse({
          uploadUrl,
          objectKey,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate presigned URL.';
    return new Response(
      JSON.stringify(
        apiErrorResponse('PRESIGN_ERROR', message),
      ),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

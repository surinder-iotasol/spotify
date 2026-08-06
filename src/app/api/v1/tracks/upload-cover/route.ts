import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiSuccessResponse, apiErrorResponse } from '@/lib/api/response';
import { generateUploadIntent, type UploadIntentInput } from '@/services/uploadIntent';
import * as auth from '@/lib/auth';

// ── Request Schema ─────────────────────────────────────────────────

const coverUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
  artistId: z.string().min(1),
  trackId: z.string().min(1),
});

// ── Allowed cover image MIME types ──────────────────────────────────

const ALLOWED_COVER_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Route Handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authentication
  const session = auth.verifySession(request.headers.get('cookie') ?? '');

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse('UNAUTHENTICATED', 'Authentication required.'),
      { status: 401 }
    );
  }

  // 2. Artist role gate
  const user = await (await import('@/lib/prisma')).default.user.findUnique({
    where: { id: session.userId },
    select: { roles: true, emailVerified: true },
  });

  if (!user || !user.emailVerified || !user.roles.includes('ARTIST')) {
    return NextResponse.json(
      apiErrorResponse('FORBIDDEN_ROLE', 'ARTIST role required to upload covers.'),
      { status: 403 }
    );
  }

  // 3. Parse body
  let body: z.infer<typeof coverUploadSchema>;
  try {
    body = coverUploadSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      apiErrorResponse('VALIDATION_ERROR', 'Invalid request body.'),
      { status: 422 }
    );
  }

  // 4. MIME type + size validation
  if (!ALLOWED_COVER_MIMES.includes(body.mimeType)) {
    return NextResponse.json(
      apiErrorResponse('INVALID_MIME_TYPE', `Cover art must be JPEG, PNG, or WebP.`),
      { status: 422 }
    );
  }

  if (body.fileSizeBytes > MAX_COVER_SIZE) {
    return NextResponse.json(
      apiErrorResponse('FILE_TOO_LARGE', `Cover art must be under 10 MB.`),
      { status: 422 }
    );
  }

  // 5. Generate presigned URL via upload intent service
  const input: UploadIntentInput = {
    fileType: 'image',
    fileName: body.fileName,
    fileSizeBytes: body.fileSizeBytes,
    mimeType: body.mimeType,
    artistId: body.artistId,
    trackId: body.trackId,
  };

  const result = await generateUploadIntent(input);

  if (!result.ok) {
    return NextResponse.json(
      apiErrorResponse('VALIDATION_ERROR', 'Cover upload intent failed.', result.errors.map(e => ({ code: e.code, message: e.message }))),
      { status: 422 }
    );
  }

  return NextResponse.json(apiSuccessResponse(result.data), { status: 200 });
}

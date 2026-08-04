/**
 * STORY-track-001: POST /api/v1/tracks/upload-intent
 *
 * Validates media file parameters and issues direct-to-storage presigned PUT URLs.
 *
 * Gate checks (applied before any storage operations):
 * - Requires authenticated session (HTTP 401 if missing).
 * - Requires verified email via DEC-004 (HTTP 403 if unverified).
 * - Requires ARTIST role context (HTTP 403 if LISTENER).
 *
 * Per DEC-008: presigned URLs are short-lived (15 min TTL).
 * Per constraint [1]: audio max 50 MB; audio/mpeg or audio/wav only.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";
import { generateUploadIntent, type UploadIntentInput } from "@/services/uploadIntent";

/* ------------------------------------------------------------------ */
/*  Request body shape                                                 */
/* ------------------------------------------------------------------ */

interface UploadIntentRequestBody {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  trackId: string;
  coverFileName?: string;
  coverFileSizeBytes?: number;
  coverMimeType?: string;
}

/* ------------------------------------------------------------------ */
/*  Route handler — POST /api/v1/tracks/upload-intent                  */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate via session cookie.
  const session = verifySession(request.headers.get("cookie") ?? "");

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "Authentication required."),
      { status: 401 },
    );
  }

  // 2. Resolve authoritative emailVerified + roles from the database.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { emailVerified: true, roles: true },
  });

  if (!user) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "User not found."),
      { status: 401 },
    );
  }

  // 3. Email verification gate (DEC-004).
  if (!user.emailVerified) {
    return NextResponse.json(
      apiErrorResponse("EMAIL_NOT_VERIFIED", "Email verification is required to upload tracks."),
      { status: 403 },
    );
  }

  // 4. ARTIST role gate — only artists may upload tracks.
  if (!user.roles.includes("ARTIST")) {
    return NextResponse.json(
      apiErrorResponse("FORBIDDEN_ROLE", "ARTIST role required to upload tracks."),
      { status: 403 },
    );
  }

  // 5. Parse and validate the request body.
  let body: UploadIntentRequestBody;
  try {
    body = (await request.json()) as UploadIntentRequestBody;
  } catch {
    return NextResponse.json(
      apiErrorResponse("INVALID_JSON", "Request body must be valid JSON."),
      { status: 400 },
    );
  }

  // Required fields check.
  if (!body.fileName || body.fileSizeBytes == null || !body.mimeType || !body.trackId) {
    return NextResponse.json(
      apiErrorResponse("MISSING_FIELDS", "fileName, fileSizeBytes, mimeType, and trackId are required."),
      { status: 400 },
    );
  }

  // 6. Build upload intent input and call service layer.
  const input: UploadIntentInput = {
    fileType: "audio",
    fileName: body.fileName,
    fileSizeBytes: body.fileSizeBytes,
    mimeType: body.mimeType,
    artistId: session.artistProfileId ?? session.userId,
    trackId: body.trackId,
    coverFileName: body.coverFileName,
    coverFileSizeBytes: body.coverFileSizeBytes,
    coverMimeType: body.coverMimeType,
  };

  const result = await generateUploadIntent(input);

  if (!result.ok) {
    return NextResponse.json(
      apiErrorResponse("VALIDATION_ERROR", "File validation failed.", result.errors.map((e) => ({ code: e.code, path: [], message: e.message }))),
      { status: 422 },
    );
  }

  // 7. Return presigned upload URLs.
  return NextResponse.json(
    apiSuccessResponse(result.data),
    { status: 200 },
  );
}

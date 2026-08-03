/**
 * STORY-role-003: POST /api/v1/auth/verify-email/confirm
 *
 * Validates incoming raw email verification tokens against SHA-256 database
 * digests.  On success:
 *   - Sets User.emailVerified = true
 *   - Sets User.emailVerifiedAt = current UTC timestamp
 *   - Deletes the used verification token record
 *
 * On failure (invalid, expired, or missing token):
 *   - Returns HTTP 400 Bad Request with code INVALID_VERIFICATION_TOKEN
 *
 * HTTP status codes:
 *   200 — Email verified successfully
 *   400 — INVALID_VERIFICATION_TOKEN (invalid or expired token)
 *   500 — Internal server error
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyEmailToken } from "@/services/emailVerificationConfirm";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      //
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse and validate the request body
  let body: { token?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      apiErrorResponse(
        "INVALID_VERIFICATION_TOKEN",
        "Invalid request body.",
      ),
      { status: 400 },
    );
  }

  const { token } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      apiErrorResponse(
        "INVALID_VERIFICATION_TOKEN",
        "Token is required.",
      ),
      { status: 400 },
    );
  }

  // 2. Verify the token against the database
  const result = await verifyEmailToken(prisma as unknown as any, token);

  // 3. Return appropriate HTTP response
  if (!result.success) {
    return NextResponse.json(
      apiErrorResponse(result.code, result.message),
      { status: result.status },
    );
  }

  // 4. Success — email verified
  return NextResponse.json(
    apiSuccessResponse({
      verified: true,
      message: result.message,
    }),
    { status: 200 },
  );
}

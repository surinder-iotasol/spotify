/**
 * STORY-role-002: POST /api/v1/auth/verify-email/request
 *
 * Generates a cryptographically secure email verification token,
 * stores its SHA-256 digest in the database, invalidates previous
 * active tokens, and dispatches a single-use verification link via email.
 *
 * Requires authentication via __Host-indie_session cookie.
 * Rate limited: 3 requests per 15 minutes per IP (sec-025).
 *
 * HTTP status codes:
 *  202 — verification token generated and email dispatched
 *  401 — UNAUTHENTICATED (missing or invalid session)
 *  429 — RATE_LIMIT_EXCEEDED (too many requests)
 *  500 — internal server error
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateVerificationToken } from "@/services/emailVerification";
import { checkVerificationRateLimit } from "@/lib/security/rateLimiter";
import { verifySession } from "@/lib/auth";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Extract client IP address for rate limiting
  const ip =
    request.headers.get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ?? "127.0.0.1";

  // 2. Apply rate limiting (sec-025)
  const rateLimitResult = checkVerificationRateLimit(ip, true);

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      apiErrorResponse(
        "RATE_LIMIT_EXCEEDED",
        "Too many verification email requests. Please try again later.",
      ),
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) },
      },
    );
  }

  // 3. Authenticate the user via session cookie
  const session = verifySession(request.headers.get("cookie") ?? "");

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse(
        "UNAUTHENTICATED",
        "Authentication required.",
      ),
      { status: 401 },
    );
  }

  // 4. Find user email for email dispatch
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });

  if (!user || !user.email) {
    return NextResponse.json(
      apiErrorResponse(
        "USER_NOT_FOUND",
        "User not found.",
      ),
      { status: 404 },
    );
  }

  // 5. Generate verification token
  const result = await generateVerificationToken(
    prisma as unknown as any,
    session.userId,
    {},
    user.email,
  );

  // 6. Map result to HTTP response
  if (!result.success) {
    return NextResponse.json(
      apiErrorResponse(result.code || "INTERNAL_ERROR", result.message),
      { status: result.status },
    );
  }

  // 7. Return 202 Accepted with confirmation
  return NextResponse.json(
    apiSuccessResponse(
      {
        message: result.message,
        expiresInSeconds: result.expiresInSeconds,
      },
      {},
    ),
    { status: 202 },
  );
}

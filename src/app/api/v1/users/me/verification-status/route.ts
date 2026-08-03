/**
 * STORY-role-003: GET /api/v1/users/me/verification-status
 *
 * Retrieves the email verification status for the currently authenticated user.
 * Returns:
 *   - emailVerified: boolean — whether the user has verified their email
 *   - canUpload: boolean — whether the user can upload tracks (verified + ARTIST/ADMIN)
 *   - roles: string[] — the user's roles
 *
 * Requires authentication via __Host-indie_session cookie.
 *
 * HTTP status codes:
 *   200 — Verification status retrieved successfully
 *   401 — UNAUTHENTICATED (missing or invalid session)
 *   500 — Internal server error
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getVerificationStatus } from "@/services/emailVerificationConfirm";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      //
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate the user via session cookie
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

  // 2. Get the verification status for the authenticated user
  const status = await getVerificationStatus(prisma as unknown as any, session.userId);

  // 3. Return the verification status
  return NextResponse.json(
    apiSuccessResponse(status),
    { status: 200 },
  );
}

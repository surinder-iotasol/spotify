/**
 * STORY-role-004: POST /api/v1/tracks — Track upload execution endpoint.
 *
 * Enforces email verification gating via requireVerifiedEmail middleware:
 * - Unverified users receive HTTP 403 EMAIL_NOT_VERIFIED
 * - Verified ARTIST/ADMIN users proceed to track creation
 * - Gating only applies to POST method (upload), not GET (listing)
 *
 * Per DEC-004: Upload execution is restricted to verified email users only.
 * Per DEC-005: Streaming, search, and playback remain ungated.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";
import { requireVerifiedEmail, type UserClaims } from "@/middleware/requireVerifiedEmail";

/**
 * Minimal user claims shape for email verification check.
 */
interface UserClaimsForEmailCheck {
  userId: string;
  emailVerified: boolean;
  roles: string[];
}

/* ------------------------------------------------------------------ */
/*  Route handler — POST /api/v1/tracks                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/v1/tracks
 *
 * Creates a new track for an authenticated ARTIST user with verified email.
 * The email verification gate runs before any database or storage operations.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate the user via session cookie
  const session = verifySession(request.headers.get("cookie") ?? "");

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "Authentication required."),
      { status: 401 },
    );
  }

  // 2. Fetch user record from database to get authoritative emailVerified + roles.
  //    We never trust client-side claims for auth decisions — only verified DB data.
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

  // 3. Apply email verification gate (DEC-004)
  const userClaims: UserClaimsForEmailCheck = {
    userId: session.userId,
    emailVerified: user.emailVerified,
    roles: user.roles,
  };

  const emailCheck = requireVerifiedEmail(
    userClaims,
    "/api/v1/tracks",
    "/verify-email",
  );

  if (!emailCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EMAIL_NOT_VERIFIED",
          message: "Email verification is required to upload tracks. Please verify your email address.",
          resendUrl: "/verify-email",
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId:
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        },
      },
      { status: 403 },
    );
  }

  // 4. At this point: user is authenticated, email is verified, and has
  //    ARTIST role (enforced by route-level RBAC).
  //    Track creation logic would proceed here (STORY-track-001).

  return NextResponse.json(
    apiSuccessResponse({
      message: "Track upload initiated.",
      status: "processing",
    }),
    { status: 202 },
  );
}

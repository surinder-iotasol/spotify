/**
 * STORY-role-001: POST /api/v1/users/me/upgrade-to-artist
 *
 * Allows a registered Listener user to upgrade to an Artist role.
 * - Validates the request body against upgradeToArtistSchema.
 * - Extracts the authenticated user from the session cookie.
 * - Calls upgradeToArtist service (atomic DB transaction).
 * - Returns HTTP 200 with updated User, ArtistProfile, and fresh JWT cookie.
 *
 * HTTP status codes:
 *  200 — upgrade successful
 *  401 — UNAUTHENTICATED (no valid session)
 *  409 — ALREADY_ARTIST (user already has ARTIST role)
 *  422 — payload validation failure
 *  500 — internal server error
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  upgradeToArtistSchema,
  upgradeToArtist,
  UPGRADE_ERRORS,
  type UpgradeInput,
} from "@/services/role";
import { validateBody } from "@/lib/api/validation";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import {
  verifyToken,
  SESSION_COOKIE_NAME,
  TokenError,
} from "@/lib/auth";
import { logRequestBody } from "@/lib/auth/logging";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // 0. Log the request body (sanitized — passwords are redacted)
  const { originalBody: body } = await logRequestBody(request, "upgrade-to-artist");

  // 1. Guard: reject if body could not be parsed
  if (body == null) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          UPGRADE_ERRORS.VALIDATION_FAILED,
          "Invalid or empty request body.",
        ),
      ),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Extract and verify the session token from the cookie
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = extractSessionToken(cookieHeader);

  if (!sessionToken) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          UPGRADE_ERRORS.USER_NOT_FOUND,
          "Unauthenticated. A valid session is required.",
        ),
      ),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let verified: { userId: string; role: string; artistProfileId?: string };
  try {
    verified = verifyToken(sessionToken);
  } catch {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          UPGRADE_ERRORS.USER_NOT_FOUND,
          "Session token is invalid or has expired.",
        ),
      ),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 3. Validate against upgrade schema
  const validation = validateBody(body, upgradeToArtistSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          UPGRADE_ERRORS.VALIDATION_FAILED,
          "Request validation failed.",
          validation.errors,
        ),
      ),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const parsed: UpgradeInput = validation.data!;

  // 4. Fetch the user to get current roles and displayName
  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: {
      id: true,
      displayName: true,
      roles: true,
    },
  });

  if (!user) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          UPGRADE_ERRORS.USER_NOT_FOUND,
          "User not found.",
        ),
      ),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 5. Call the upgrade service (atomic transaction)
  const result = await upgradeToArtist(
    prisma as unknown as any,
    user.id,
    user.roles as string[],
    user.displayName,
    parsed,
  );

  // 6. Map result to HTTP response
  if (!result.success) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(result.code, result.message),
      ),
      {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 7. Build 200 response with Set-Cookie header and response data
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (result.cookie) {
    headers.set("Set-Cookie", result.cookie);
  }

  const envelope = apiSuccessResponse(
    {
      user: result.user,
      artistProfile: result.artistProfile,
    },
    { message: result.message },
  );

  return new Response(
    JSON.stringify(envelope),
    {
      status: 200,
      headers,
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract the session token from the cookie header.
 * Copied here to avoid Next.js edge runtime issues with the middleware module.
 */
function extractSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf("=");
        if (idx === -1) return [c, ""];
        return [c.slice(0, idx), c.slice(idx + 1)];
      }),
  );

  return cookies[SESSION_COOKIE_NAME] ?? null;
}

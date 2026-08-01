/**
 * Next.js Edge Middleware — admin route guards.
 *
 * This module is a thin edge adapter that:
 * 1. Intercepts `/admin/*` and `/api/v1/admin/*` routes.
 * 2. Delegates to the pure RBAC module (src/lib/auth/middleware.ts).
 * 3. Returns appropriate HTTP responses for edge runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/auth/middleware";

/**
 * Build a JSON error response with the given status code.
 */
function createErrorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      meta: {
        timestamp: new Date().toISOString(),
        requestId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      },
    },
    { status },
  );
}

/**
 * Build a response that allows the request to continue, injecting
 * decoded identity claims into request headers for downstream handlers.
 */
function allowWithHeaders(
  request: NextRequest,
  userId: string,
  role: string,
  artistProfileId?: string,
): NextResponse {
  const nextResponse = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  nextResponse.headers.set("x-user-id", userId);
  nextResponse.headers.set("x-user-role", role);
  if (artistProfileId) {
    nextResponse.headers.set("x-artist-profile-id", artistProfileId);
  }

  return nextResponse;
}

/**
 * Next.js Edge Middleware — intercepts `/admin/*` and `/api/v1/admin/*` routes
 * and enforces admin-only authorization.
 *
 * - Unauthenticated requests → HTTP 401 `UNAUTHENTICATED`
 * - Authenticated non-admin → HTTP 403 `FORBIDDEN_INSUFFICIENT_ROLE`
 * - Admin → Continue with decoded claims in headers
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Delegate to pure RBAC module
  const result = checkAdminAccess({
    pathname,
    cookieHeader: request.headers.get("cookie"),
  });

  if (!result.authorized) {
    return createErrorResponse(result.status, result.code, result.message);
  }

  // Allow through with identity headers
  return allowWithHeaders(request, result.userId, result.role, result.artistProfileId);
}

/**
 * Next.js Edge Middleware — server-side route guarding.
 *
 * This module is a thin edge adapter that:
 * 1. Intercepts protected routes: /admin/*, /api/v1/admin/*,
 *    /api/v1/artist/*, /api/v1/playlists/*, /api/v1/reports/*.
 * 2. Delegates to the pure RBAC module (src/lib/auth/middleware.ts).
 * 3. Returns 401 for unauthenticated, 403 for insufficient role.
 * 4. Injects decoded identity claims (x-user-id, x-user-role,
 *    x-artist-profile-id) into request headers for downstream handlers.
 * 5. Public routes (search, track streaming) bypass all checks per DEC-005.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRouteAccess } from "@/lib/auth/middleware";

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
 * Next.js Edge Middleware — intercepts protected routes and enforces
 * role-based authorization.
 *
 * Route categories and minimum roles:
 *   /admin/*, /api/v1/admin/*       → ADMIN
 *   /api/v1/artist/*                → ARTIST (ADMIN also allowed)
 *   /api/v1/playlists/*             → LISTENER (any authenticated user)
 *   /api/v1/reports/*               → LISTENER (any authenticated user)
 *
 * Public routes (search, track streaming) bypass all checks.
 *
 * - Unauthenticated requests → HTTP 401 `UNAUTHENTICATED`
 * - Authenticated non-admin → HTTP 403 `FORBIDDEN_INSUFFICIENT_ROLE`
 * - Authorized → Continue with decoded claims in headers
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Delegate to pure RBAC module with role hierarchy
  const result = checkRouteAccess({
    pathname,
    cookieHeader: request.headers.get("cookie"),
  });

  if (!result.authorized) {
    return createErrorResponse(result.status, result.code, result.message);
  }

  // Allow through with identity headers (only when claims are available)
  if ("userId" in result && "role" in result) {
    return allowWithHeaders(request, result.userId, result.role, result.artistProfileId);
  }

  // Public route — no claims to inject, let it through
  return NextResponse.next();
}

// Match all protected route patterns
export const config = {
  matcher: ["/admin/:path*", "/api/v1/admin/:path*", "/api/v1/artist/:path*", "/api/v1/playlists/:path*", "/api/v1/reports/:path*"],
};

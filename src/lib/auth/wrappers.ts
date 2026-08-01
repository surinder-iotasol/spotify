/**
 * Higher-order API handler wrappers for Next.js API routes.
 *
 * - `withAuth` extracts claims from request headers injected by middleware
 *   (or direct cookie verification) and constructs an immutable AuthContext.
 * - `withRole` wraps `withAuth` and verifies that AuthContext.user.role matches
 *   one of the specified allowed roles for the route.
 * - Token invalidation or expiry caught inside the wrapper returns HTTP 401
 *   Unauthorized with standardized envelope error code ERR_UNAUTHORIZED.
 *
 * Usage:
 *   export const GET = withAuth(async (context, req) => {
 *     const userId = context.user.userId;
 *     // handler logic...
 *   });
 *
 *   export const POST = withRole(
 *     ["ADMIN"],
 *     async (context, req) => {
 *       // only admins reach here
 *     }
 *   );
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  verifyToken,
  SESSION_COOKIE_NAME,
  TokenError,
  type UserRole,
  type VerifiedSession,
} from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Standardized error codes                                          */
/* ------------------------------------------------------------------ */

/**
 * Machine-readable error code for authentication failures.
 * Returned as HTTP 401 Unauthorized when session is missing, expired, or invalid.
 */
export const ERR_UNAUTHORIZED = "ERR_UNAUTHORIZED";

/**
 * Machine-readable error code for insufficient role.
 * Returned as HTTP 403 Forbidden when the user's role does not match required roles.
 */
export const ERR_FORBIDDEN_ROLE = "ERR_FORBIDDEN_ROLE";

/* ------------------------------------------------------------------ */
/*  Immutable AuthContext                                               */
/* ------------------------------------------------------------------ */

/**
 * Immutable snapshot of the authenticated user extracted from a valid session.
 *
 * `Object.freeze` is applied so downstream handlers cannot mutate the context.
 *
 * Claims source:
 * - `userId`       — from JWT `sub` claim (or `x-user-id` header)
 * - `role`         — from JWT `role` claim (or `x-user-role` header)
 * - `artistProfileId` — optional JWT claim (or `x-artist-profile-id` header)
 */
export class AuthContext {
  public readonly user: {
    userId: string;
    role: UserRole;
    artistProfileId?: string;
  };

  private constructor(user: {
    userId: string;
    role: UserRole;
    artistProfileId?: string;
  }) {
    this.user = Object.freeze({ ...user });
    Object.freeze(this.user);
  }

  /**
   * Create a frozen AuthContext instance.
   */
  static create(user: {
    userId: string;
    role: UserRole;
    artistProfileId?: string;
  }): AuthContext {
    return new AuthContext(user);
  }

  /**
   * Return a plain-object representation for logging or debugging.
   * Note: the returned object is a shallow copy (not frozen).
   */
  toJSON(): {
    userId: string;
    role: UserRole;
    artistProfileId?: string;
  } {
    return { ...this.user };
  }
}

/* ------------------------------------------------------------------ */
/*  Request helpers (no Next.js dependencies — easily unit-testable)    */
/* ------------------------------------------------------------------ */

/**
 * Parse the Cookie header value into a simple key-value map.
 * Handles `__Host-*` prefix cookies correctly.
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
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
}

/**
 * Extract session token from a generic object with a `headers` getter.
 *
 * This abstraction lets us test the wrapper without importing Next.js internals.
 * Accepts any object with `headers: Headers | { get(key: string): string | null }`.
 *
 * Priority order:
 *  1. `x-session-token` header (injected by middleware for internal handlers)
 *  2. `__Host-indie_session` cookie
 *
 * Returns `null` when no token is present.
 */
export function extractSessionToken(
  requestLike: { headers: { get(key: string): string | null } },
): string | null {
  // Middleware-injected header takes priority
  const headerToken = requestLike.headers.get("x-session-token");
  if (headerToken) return headerToken;

  // Fall back to cookie
  const cookieHeader = requestLike.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

/**
 * Parse the middleware-injected `x-user-*` headers from a request-like object.
 *
 * Returns `null` when required headers are absent.
 */
export function parseUserHeaders(
  requestLike: { headers: { get(key: string): string | null } },
): {
  userId: string;
  role: UserRole;
  artistProfileId?: string;
} | null {
  const userId = requestLike.headers.get("x-user-id");
  const role = requestLike.headers.get("x-user-role") as UserRole | null;
  const artistProfileId = requestLike.headers.get("x-artist-profile-id") ?? undefined;

  if (!userId || !role) return null;

  return { userId, role, artistProfileId };
}

/* ------------------------------------------------------------------ */
/*  AuthContext extraction from request                                 */
/* ------------------------------------------------------------------ */

/**
 * Extract an `AuthContext` from a request-like object.
 *
 * Priority:
 * 1. Middleware-injected `x-user-*` headers (already verified by middleware)
 * 2. Direct cookie token verification via `verifyToken`
 *
 * Returns `null` when the request cannot be authenticated.
 */
export function extractAuthContext(
  requestLike: { headers: { get(key: string): string | null } },
): AuthContext | null {
  // Priority 1: use middleware-injected headers
  const parsed = parseUserHeaders(requestLike);
  if (parsed) {
    return AuthContext.create(parsed);
  }

  // Priority 2: direct cookie verification
  const sessionToken = extractSessionToken(requestLike);
  if (!sessionToken) return null;

  try {
    const verified = verifyToken(sessionToken) as VerifiedSession;
    return AuthContext.create({
      userId: verified.userId,
      role: verified.role,
      artistProfileId: verified.artistProfileId,
    });
  } catch {
    // Token expired, tampered, or otherwise invalid
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Role validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Validate that the user's role is in the allowed list.
 *
 * @param authContext - The authenticated context with user role.
 * @param allowedRoles - Array of roles permitted for the route.
 * @returns `true` if authorized, `false` otherwise.
 */
export function validateRole(
  authContext: AuthContext,
  allowedRoles: UserRole[],
): boolean {
  return allowedRoles.includes(authContext.user.role);
}

/* ------------------------------------------------------------------ */
/*  Response builders                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate a deterministic request ID for tracing.
 */
function generateRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Build a 401 Unauthorized JSON error body.
 * This function has zero Next.js dependencies for easy testing.
 */
export function buildUnauthorizedResponse(): {
  status: 401;
  body: {
    success: false;
    error: { code: typeof ERR_UNAUTHORIZED; message: string };
    meta: { timestamp: string; requestId: string };
  };
} {
  return {
    status: 401,
    body: {
      success: false,
      error: { code: ERR_UNAUTHORIZED, message: "Unauthorized" },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    },
  };
}

/**
 * Build a 403 Forbidden JSON error body for role violations.
 */
export function buildForbiddenRoleResponse(): {
  status: 403;
  body: {
    success: false;
    error: { code: typeof ERR_FORBIDDEN_ROLE; message: string };
    meta: { timestamp: string; requestId: string };
  };
} {
  return {
    status: 403,
    body: {
      success: false,
      error: { code: ERR_FORBIDDEN_ROLE, message: "Insufficient role for this resource" },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId(),
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Next.js higher-order function wrappers                              */
/* ------------------------------------------------------------------ */

/**
 * Handler signature for wrapped API route handlers.
 */
export type AuthHandler<T = NextResponse> = (
  context: AuthContext,
  req: NextRequest,
) => Promise<T>;

/**
 * Wrap an API handler so that it requires authentication.
 *
 * Extracts claims from the request (via middleware headers or direct cookie
 * verification), builds an immutable `AuthContext`, and passes it to the
 * inner handler. If authentication fails, returns HTTP 401 with a
 * standardized error envelope (`ERR_UNAUTHORIZED`).
 *
 * @param handler - The handler function that receives an `AuthContext` and request.
 * @returns A handler compatible with Next.js App Router API routes.
 *
 * @example
 *   export const GET = withAuth(async (context, req) => {
 *     return Response.json({ userId: context.user.userId });
 *   });
 */
export function withAuth<T extends AuthHandler>(
  handler: T,
): (req: NextRequest) => Promise<ReturnType<T> | NextResponse> {
  return async function wrappedHandler(req: NextRequest) {
    const authContext = extractAuthContext(req);

    if (!authContext) {
      return NextResponse.json(buildUnauthorizedResponse().body, {
        status: 401,
      });
    }

    return handler(authContext, req);
  };
}

/**
 * Wrap an API handler so that it requires both authentication and a
 * specific role.
 *
 * This composes `withAuth` + a role check. If the user is not
 * authenticated, returns HTTP 401 (`ERR_UNAUTHORIZED`). If authenticated
 * but their role does not match any of the allowed roles, returns HTTP 403
 * (`ERR_FORBIDDEN_ROLE`).
 *
 * @param allowedRoles - Array of roles permitted to access this route.
 * @param handler - The inner handler function.
 * @returns A handler compatible with Next.js App Router API routes.
 *
 * @example
 *   export const DELETE = withRole(
 *     ["ADMIN"],
 *     async (context, req) => {
 *       // only admins reach here
 *       return Response.json({ deleted: true });
 *     }
 *   );
 */
export function withRole<T extends AuthHandler>(
  allowedRoles: UserRole[],
  handler: T,
): (req: NextRequest) => Promise<ReturnType<T> | NextResponse> {
  return withAuth(async (context, req) => {
    if (!validateRole(context, allowedRoles)) {
      return NextResponse.json(buildForbiddenRoleResponse().body, {
        status: 403,
      });
    }
    return handler(context, req);
  });
}

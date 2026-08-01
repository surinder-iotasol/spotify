/**
 * Pure RBAC authorization logic — no Next.js dependencies.
 *
 * This module is fully testable in Node.js / vitest without mocking next/server.
 * The Next.js middleware.ts is a thin edge adapter that uses these functions.
 */

import {
  verifyToken,
  SESSION_COOKIE_NAME,
  TokenError,
  type UserRole,
} from "@/lib/auth";

/**
 * Roles that are allowed to access admin routes.
 */
export const ADMIN_ROLES: UserRole[] = ["ADMIN"];

/**
 * Route matchers that require admin authorization.
 */
export const ADMIN_ROUTE_PATTERNS = ["/admin", "/api/v1/admin"];

/**
 * Error response codes used by the RBAC middleware.
 */
export const RBAC_ERRORS = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN_INSUFFICIENT_ROLE: "FORBIDDEN_INSUFFICIENT_ROLE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_INVALID: "SESSION_INVALID",
} as const;

/**
 * Parse the Cookie header value into a simple key-value map.
 * Handles __Host-* prefix cookies correctly.
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
 * Check if the given pathname matches any admin route pattern.
 */
export function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PATTERNS.some(
    (pattern) => pathname === pattern || pathname.startsWith(`${pattern}/`),
  );
}

/**
 * Extract the session token from the cookie header.
 */
export function extractSessionToken(cookieHeader: string | null): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

/**
 * Verify a JWT session token and return the decoded claims.
 */
export function getSessionClaims(token: string): {
  userId: string;
  role: UserRole;
  artistProfileId?: string;
} {
  const verified = verifyToken(token);
  return {
    userId: verified.userId,
    role: verified.role,
    artistProfileId: verified.artistProfileId,
  };
}

/**
 * Check if the user has admin role.
 */
export function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * Full RBAC check for admin routes.
 *
 * @returns Object with `authorized: true` and user claims, or `authorized: false` with error info.
 */
export function checkAdminAccess(options: {
  pathname: string;
  cookieHeader: string | null;
}):
  | { authorized: true; userId: string; role: UserRole; artistProfileId?: string }
  | { authorized: false; status: number; code: string; message: string } {
  const { pathname, cookieHeader } = options;

  // Only protect admin-matching paths
  if (!isAdminRoute(pathname)) {
    return { authorized: true };
  }

  // Step 1: Extract session token from cookies
  const sessionToken = extractSessionToken(cookieHeader);
  if (!sessionToken) {
    return {
      authorized: false,
      status: 401,
      code: RBAC_ERRORS.UNAUTHENTICATED,
      message: "Authentication is required to access this resource",
    };
  }

  // Step 2: Verify the JWT token
  let userId: string;
  let role: UserRole;
  let artistProfileId: string | undefined;

  try {
    const verified = getSessionClaims(sessionToken);
    userId = verified.userId;
    role = verified.role;
    artistProfileId = verified.artistProfileId;
  } catch (err) {
    if (err instanceof TokenError) {
      return {
        authorized: false,
        status: 401,
        code: RBAC_ERRORS.SESSION_EXPIRED,
        message: "Your session has expired. Please log in again.",
      };
    }
    return {
      authorized: false,
      status: 401,
      code: RBAC_ERRORS.UNAUTHENTICATED,
      message: "Authentication is required to access this resource",
    };
  }

  // Step 3: Check admin role
  if (!isAdmin(role)) {
    return {
      authorized: false,
      status: 403,
      code: RBAC_ERRORS.FORBIDDEN_INSUFFICIENT_ROLE,
      message: "You do not have sufficient permissions to access this resource",
    };
  }

  // Step 4: Allow through
  return { authorized: true, userId, role, artistProfileId };
}

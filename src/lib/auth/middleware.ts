/**
 * Pure RBAC authorization logic — no Next.js dependencies.
 *
 * This module is fully testable in Node.js / vitest without mocking next/server.
 * The Next.js middleware.ts is a thin edge adapter that uses these functions.
 *
 * Role hierarchy (ascending):
 *   LISTENER (1) — can access playlists, reports
 *   ARTIST   (2) — can access playlists, reports, artist endpoints
 *   ADMIN    (3) — can access everything including admin endpoints
 */

import {
  verifyToken,
  SESSION_COOKIE_NAME,
  TokenError,
  type UserRole,
} from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Role hierarchy                                                      */
/* ------------------------------------------------------------------ */

/**
 * Role levels for hierarchy comparison.
 * Higher level = more privileges.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  LISTENER: 1,
  ARTIST: 2,
  ADMIN: 3,
};

/**
 * Roles that are allowed to access admin routes.
 * @deprecated Use checkRouteAccess instead — kept for backward compatibility.
 */
export const ADMIN_ROLES: UserRole[] = ["ADMIN"];

/* ------------------------------------------------------------------ */
/*  Route categories                                                    */
/* ------------------------------------------------------------------ */

/**
 * Named route category prefixes used throughout the app.
 */
export const ROUTE_CATEGORIES = {
  ADMIN: "/admin",
  API_ADMIN: "/api/v1/admin",
  ARTIST: "/api/v1/artist",
  PLAYLISTS: "/api/v1/playlists",
  REPORTS: "/api/v1/reports",
} as const;

/**
 * Minimum role required for each protected route prefix.
 * The value is the minimum UserRole level that can access routes under this prefix.
 */
export const ROUTE_MIN_ROLE: Record<string, UserRole> = {
  [ROUTE_CATEGORIES.ADMIN + "/"]: "ADMIN",
  [ROUTE_CATEGORIES.API_ADMIN + "/"]: "ADMIN",
  [ROUTE_CATEGORIES.ARTIST + "/"]: "ARTIST",
  [ROUTE_CATEGORIES.PLAYLISTS + "/"]: "LISTENER",
  [ROUTE_CATEGORIES.REPORTS + "/"]: "LISTENER",
};

/**
 * Path prefixes that are completely public and bypass all role checks,
 * even when they would otherwise fall under a protected category.
 * Per DEC-005: guest search and track streaming must be accessible to guests.
 */
export const PUBLIC_PATHS = ["/api/v1/search"];

/* ------------------------------------------------------------------ */
/*  Error response codes                                                */
/* ------------------------------------------------------------------ */

/**
 * Error response codes used by the RBAC middleware.
 */
export const RBAC_ERRORS = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN_INSUFFICIENT_ROLE: "FORBIDDEN_INSUFFICIENT_ROLE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_INVALID: "SESSION_INVALID",
} as const;

/* ------------------------------------------------------------------ */
/*  Legacy admin-only route patterns (backward compat)                  */
/* ------------------------------------------------------------------ */

/**
 * Route matchers that require admin authorization.
 * Kept for backward compatibility with checkAdminAccess.
 */
export const ADMIN_ROUTE_PATTERNS = ["/admin", "/api/v1/admin"];

/* ------------------------------------------------------------------ */
/*  Cookie parsing                                                      */
/* ------------------------------------------------------------------ */

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
 * Extract the session token from the cookie header.
 */
export function extractSessionToken(cookieHeader: string | null): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Route matching                                                      */
/* ------------------------------------------------------------------ */

/**
 * Check if the given pathname matches any admin route pattern.
 * Kept for backward compatibility with checkAdminAccess.
 */
export function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PATTERNS.some(
    (pattern) => pathname === pattern || pathname.startsWith(`${pattern}/`),
  );
}

/**
 * Determine which route category a pathname belongs to,
 * returning the minimum required role for that category.
 */
function getRouteMinRole(pathname: string): {
  matched: boolean;
  minRole: UserRole;
} {
  for (const [prefix, minRole] of Object.entries(ROUTE_MIN_ROLE)) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return { matched: true, minRole };
    }
  }
  return { matched: false, minRole: "LISTENER" as UserRole };
}

/**
 * Check if the given pathname is public and bypasses all role checks.
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((publicPath) => pathname === publicPath);
}

/* ------------------------------------------------------------------ */
/*  Session claim helpers                                               */
/* ------------------------------------------------------------------ */

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
 * Type for the result of checkRouteAccess.
 * When the route is public or not matched, returns `{ authorized: true }` without claims.
 * When the route is matched and user is authorized, returns claims.
 * When unauthorized, returns error details.
 */
export type RouteAccessResult =
  | { authorized: true }
  | { authorized: true; userId: string; role: UserRole; artistProfileId?: string }
  | { authorized: false; status: number; code: string; message: string };

/**
 * Full RBAC check with role hierarchy for all protected route categories.
 *
 * Route categories and minimum roles:
 *   /admin/*, /api/v1/admin/*       → ADMIN
 *   /api/v1/artist/*                → ARTIST (ADMIN also allowed)
 *   /api/v1/playlists/*             → LISTENER (any authenticated user)
 *   /api/v1/reports/*               → LISTENER (any authenticated user)
 *
 * Public routes (e.g. /api/v1/search) bypass all checks.
 *
 * @returns Object with `authorized: true` and user claims, or `authorized: false` with error info.
 */
export function checkRouteAccess(options: {
  pathname: string;
  cookieHeader: string | null;
}): RouteAccessResult {
  const { pathname, cookieHeader } = options;

  // Strip query string for path matching
  const cleanPath = pathname.split("?")[0];

  // Step 0: Public routes bypass all checks
  if (isPublicPath(cleanPath)) {
    return { authorized: true };
  }

  // Step 1: Determine if this path is protected and the minimum role required
  const { matched, minRole } = getRouteMinRole(cleanPath);
  if (!matched) {
    // Not a protected route — allow through without checks
    return { authorized: true };
  }

  // Step 2: Extract session token from cookies
  const sessionToken = extractSessionToken(cookieHeader);
  if (!sessionToken) {
    return {
      authorized: false,
      status: 401,
      code: RBAC_ERRORS.UNAUTHENTICATED,
      message: "Authentication is required to access this resource",
    };
  }

  // Step 3: Verify the JWT token and decode claims
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

  // Step 4: Enforce role hierarchy — caller's level must meet or exceed the route's minimum
  if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
    return {
      authorized: false,
      status: 403,
      code: RBAC_ERRORS.FORBIDDEN_INSUFFICIENT_ROLE,
      message: "You do not have sufficient permissions to access this resource",
    };
  }

  // Step 5: Allow through with identity claims
  return { authorized: true, userId, role, artistProfileId };
}

/**
 * Legacy wrapper that delegates to checkRouteAccess for backward compatibility.
 * Only protects /admin/* and /api/v1/admin/* routes with ADMIN-only enforcement.
 *
 * @deprecated Use checkRouteAccess directly.
 */
export function checkAdminAccess(options: {
  pathname: string;
  cookieHeader: string | null;
}):
  | { authorized: true; userId: string; role: UserRole; artistProfileId?: string }
  | { authorized: false; status: number; code: string; message: string } {
  // If it's not an admin route, always allow
  if (!isAdminRoute(options.pathname)) {
    return { authorized: true };
  }
  // Delegate to the full checker which requires ADMIN for admin routes
  return checkRouteAccess(options);
}

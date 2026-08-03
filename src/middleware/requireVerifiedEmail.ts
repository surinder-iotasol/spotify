/**
 * STORY-role-004: requireVerifiedEmail middleware.
 *
 * Enforces DEC-004: restricts track upload execution exclusively to users
 * with verified email addresses. Intercepts request flows targeting
 * POST /api/v1/tracks and POST /api/v1/tracks/upload-intent, rejecting
 * unverified users with HTTP 403 Forbidden without affecting streaming,
 * search, or playlist actions.
 *
 * Per DEC-005: streaming, playback, search, following, and playlist
 * endpoints remain ungated.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Minimal request-like object shape accepted by the middleware. */
export interface NextRequestLike {
  headers: { get(key: string): string | null };
  nextUrl: { pathname: string };
  method?: string;
}

/** User claims extracted from an authenticated session. */
export interface UserClaims {
  userId: string;
  emailVerified: boolean;
  roles: string[];
}

/** Result of the email verification check. */
export interface EmailCheckResult {
  allowed: boolean;
  status?: number;
  response?: Response;
}

/* ------------------------------------------------------------------ */
/*  Whitelisted path prefixes that bypass email verification gating    */
/*  Per DEC-004 / DEC-005: these are public or non-upload flows.       */
/* ------------------------------------------------------------------ */

/**
 * Paths that are explicitly gated for email verification.
 * POST to these endpoints requires verified email (DEC-004).
 * Exact match only — no prefix matching.
 */
const GATED_UPLOAD_PATHS = ["/api/v1/tracks", "/api/v1/tracks/upload-intent"];

/**
 * Paths that are completely public and bypass email verification gating,
 * per DEC-005: streaming, search, playlists, following must be accessible regardless.
 */
const EMAIL_NOT_GATED_PATHS = [
  "/api/v1/search",
  "/api/v1/playlists",
  "/api/v1/users/following",
  "/api/v1/users/me/verification-status",
];

/**
 * Check whether a pathname is explicitly gated for email verification.
 * Gating applies to POST requests targeting upload endpoints.
 */
export function isGatedPath(pathname: string, method: string = "POST"): boolean {
  if (method !== "POST") return false;
  return GATED_UPLOAD_PATHS.includes(pathname);
}

/**
 * Check whether a pathname is exempt from email verification gating.
 * Ungated paths are public per DEC-004 / DEC-005.
 *
 * Note: `/api/v1/tracks` is ungated for GET requests (public listing)
 * but POST uploads to that same path are gated. The caller checks
 * `isGatedPath()` before this function, so gated paths take priority.
 */
export function verifyEmailNotGatedPath(pathname: string): boolean {
  // Exact ungated paths
  if (EMAIL_NOT_GATED_PATHS.includes(pathname)) return true;

  // Prefix match for playlists, following, and search sub-paths
  if (
    pathname.startsWith("/api/v1/playlists/") ||
    pathname.startsWith("/api/v1/users/following/") ||
    pathname.startsWith("/api/v1/search/")
  ) {
    return true;
  }

  // Streaming endpoints: /api/v1/tracks/:id/*
  // This intentionally excludes the bare /api/v1/tracks path (handled by
  // isGatedPath for POST uploads) and upload-intent (also gated).
  if (pathname.startsWith("/api/v1/tracks/")) {
    if (pathname.startsWith("/api/v1/tracks/upload-intent")) return false;
    return true;
  }

  return false;
}

/**
 * Check whether a user's email is verified for the given pathname and HTTP method.
 *
 * Gating order (priority):
 * 1. Check if the path is a gated upload endpoint — reject unverified users
 * 2. Check if the path is ungated per DEC-005 — allow through
 * 3. Otherwise — reject unverified users (fail-safe)
 *
 * This ensures POST /api/v1/tracks (upload) is gated even though the
 * same path is ungated for GET requests (public track listing).
 *
 * @param user      — User claims with emailVerified and roles.
 * @param pathname  — The request pathname to check against gates.
 * @param methodOrResendUrl — HTTP method string (e.g. "POST", "GET") OR optional
 *                           resend URL for the 403 response. When omitted,
 *                           the method defaults to "POST" and the default resend
 *                           URL is used. When a URL is provided, it is treated
 *                           as the resend URL (backward-compatible with existing
 *                           callers). To override the resend URL for a specific
 *                           method, pass method via the `method` parameter below.
 * @param resendUrl — Optional explicit resend URL for the 403 response.
 *                    When this is provided, methodOrResendUrl is treated as
 *                    the HTTP method.
 * @returns EmailCheckResult indicating whether the request is allowed.
 */
export function requireVerifiedEmail(
  user: UserClaims,
  pathname: string,
  methodOrResendUrl?: string,
  resendUrl?: string,
): EmailCheckResult {
  // Determine the HTTP method and resend URL from parameters.
  // Resolution order:
  // 1. If resendUrl (4th param) is provided → methodOrResendUrl is the method
  // 2. If methodOrResendUrl looks like a URL (starts with /) → it's the resendUrl
  // 3. Otherwise → methodOrResendUrl is the method, use default resendUrl
  let method = "POST";
  let finalResendUrl = resendUrl;

  if (resendUrl !== undefined) {
    // 4th param provided → 3rd param is the method
    method = methodOrResendUrl ?? "POST";
  } else if (methodOrResendUrl !== undefined) {
    const upper = methodOrResendUrl.toUpperCase();
    if (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(upper)) {
      // 3rd param is an HTTP method
      method = upper;
      finalResendUrl = undefined;
    } else {
      // 3rd param looks like a URL → backward-compatible: use as resendUrl
      finalResendUrl = methodOrResendUrl;
    }
  }

  // Priority 1: gated upload endpoints — reject unverified users
  if (isGatedPath(pathname, method)) {
    if (!user.emailVerified) {
      return {
        allowed: false,
        status: 403,
        response: createEmailNotVerifiedResponse(finalResendUrl),
      };
    }
  }

  // Priority 2: ungated public endpoints — allow through
  if (verifyEmailNotGatedPath(pathname)) {
    return { allowed: true };
  }

  // Priority 3: fail-safe — if the path is not explicitly ungated,
  // reject unverified users (conservative approach)
  if (!user.emailVerified) {
    return {
      allowed: false,
      status: 403,
      response: createEmailNotVerifiedResponse(finalResendUrl),
    };
  }

  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/*  Response helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Default URL to resend email verification tokens.
 */
const DEFAULT_RESEND_URL = "/verify-email";

/**
 * Create a 403 Forbidden response for unverified email accounts.
 */
export function createEmailNotVerifiedResponse(
  resendUrl?: string,
): Response {
  const body = JSON.stringify({
    success: false,
    error: {
      code: "EMAIL_NOT_VERIFIED",
      message: "Email verification is required to upload tracks. Please verify your email address.",
      resendUrl: resendUrl ?? DEFAULT_RESEND_URL,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    },
  });

  return new Response(body, {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/*  Core middleware logic                                              */
/* ------------------------------------------------------------------ */

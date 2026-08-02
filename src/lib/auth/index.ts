/**
 * Authentication helpers: password hashing and JWT session management.
 *
 * - `hashPassword` / `comparePassword` wrap bcryptjs with cost factor 12.
 * - `generateToken` / `verifyToken` handle 7-day stateless JWT sessions.
 * - Session cookie options for __Host-indie_session (HttpOnly, Secure, SameSite=Strict).
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/* ------------------------------------------------------------------ */
/*  Password hashing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Bcrypt cost factor used for password hashing.
 * Default: 12 — balances security and performance (~250 ms/hash on modern hardware).
 */
export const BCRYPT_COST = 12;

/**
 * Hash a plaintext password using bcrypt with cost factor 12.
 *
 * @param password - The plaintext password to hash.
 * @returns The bcrypt hash string.
 * @throws If hashing fails (e.g., out of memory).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 *
 * @param password - The plaintext password to check.
 * @param hash     - The stored bcrypt hash.
 * @returns `true` if the password matches, `false` otherwise.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/* ------------------------------------------------------------------ */
/*  JWT token types                                                    */
/* ------------------------------------------------------------------ */

/**
 * User roles supported by the platform.
 */
export type UserRole = "LISTENER" | "ARTIST" | "ADMIN";

/**
 * JWT session payload claims.
 */
export interface JwtSessionPayload {
  sub: string;       // userId
  role: UserRole;
  artistProfileId?: string;
  iat: number;
  exp: number;
}

/**
 * Verified (decoded) JWT payload returned by verifyToken.
 */
export interface VerifiedSession extends JwtSessionPayload {
  userId: string;
  role: UserRole;
  artistProfileId?: string;
}

/* ------------------------------------------------------------------ */
/*  Cookie configuration                                               */
/* ------------------------------------------------------------------ */

/**
 * Session cookie name.
 * Uses the __Host prefix per security best practice (RFC 6265).
 */
export const SESSION_COOKIE_NAME = "__Host-indie_session";

/**
 * Session cookie duration in seconds (7 days = 604800).
 */
export const SESSION_COOKIE_MAX_AGE = 604_800;

/**
 * Session cookie duration in milliseconds for JWT exp calculation.
 */
export const SESSION_COOKIE_DURATION_MS = SESSION_COOKIE_MAX_AGE * 1000;

/**
 * Cookie options for HTTP-only session cookies.
 */
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: true;
  sameSite: "strict";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

/**
 * Build a Set-Cookie header string for the session cookie.
 */
export function buildSetCookieHeader(token: string): string {
  const opts = sessionCookieOptions();
  const parts: string[] = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
    `Path=/`,
    `Max-Age=${opts.maxAge}`,
  ];
  return parts.join("; ");
}

/* ------------------------------------------------------------------ */
/*  JWT token generation & verification                                */
/* ------------------------------------------------------------------ */

/**
 * Get the JWT secret from environment variables.
 * Throws if JWT_SECRET is not set.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Generate a signed JWT session token.
 *
 * @param payload - User identity claims (userId, role, optional artistProfileId).
 * @returns A signed JWT string with 7-day expiration.
 */
export function generateToken(payload: Omit<JwtSessionPayload, "iat" | "exp">): string {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const token = jwt.sign(
    {
      ...payload,
      iat: now,
      exp: now + SESSION_COOKIE_MAX_AGE,
    },
    secret,
    { algorithm: "HS256" },
  );

  return token;
}

/**
 * Verify and decode a JWT session token.
 *
 * @param token - The JWT string to verify.
 * @returns The verified session payload with `userId` alias.
 * @throws `TokenError` if the token is expired, tampered, or otherwise invalid.
 */
export function verifyToken(token: string): VerifiedSession {
  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as JwtSessionPayload;

    return {
      userId: decoded.sub,
      role: decoded.role,
      artistProfileId: decoded.artistProfileId,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenError("SESSION_EXPIRED", "Session token has expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new TokenError("SESSION_INVALID", "Session token is invalid or tampered");
    }
    throw new TokenError("SESSION_INVALID", "Session token verification failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Cookie parsing & session extraction                                */
/* ------------------------------------------------------------------ */

/**
 * Parse the Cookie header value into a simple key-value map.
 *
 * @param cookieHeader — The raw Cookie header string.
 * @returns A map of cookie name → value.
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
 * Extract the session JWT token from a Cookie header string.
 *
 * @param cookieHeader — The raw Cookie header.
 * @returns The session token, or `null` if not present.
 */
export function extractSessionToken(cookieHeader: string | null): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

/**
 * Verify the session cookie from a Cookie header and return the
 * decoded JWT payload, or `null` if the session is missing or invalid.
 *
 * @param cookieHeader — The raw Cookie header string.
 * @returns The verified session (with `userId`), or `null`.
 */
export function verifySession(cookieHeader: string | null): VerifiedSession | null {
  const token = extractSessionToken(cookieHeader);
  if (!token) return null;

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

/**
 * Structured error for JWT session failures.
 */
export class TokenError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

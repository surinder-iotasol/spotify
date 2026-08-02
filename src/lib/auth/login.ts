/**
 * STORY-auth-002: User login validation schema, rate limiting,
 * and authentication service.
 *
 * - Zod schema validates { email, password }.
 * - Rate limiting: 5 failed attempts per 15 minutes per IP.
 * - On success: bcrypt comparePassword, JWT session token, 7-day __Host-indie_session cookie.
 * - On failure: HTTP 401 INVALID_CREDENTIALS or HTTP 429 RATE_LIMIT_EXCEEDED.
 */

import { z } from "zod";
import { comparePassword, type UserRole, generateToken, SESSION_COOKIE_NAME } from ".";
import { sanitizePasswordHash } from "@/lib/security/password";
import type { ValidationErrorDetail } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Validation schema                                                  */
/* ------------------------------------------------------------------ */

/**
 * Login input schema — simple email + password.
 * Email is normalised to lowercase.
 */
export const loginSchema = z.object({
  email: z.string().email("Email must be a valid email address").transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

/** Input type after schema transformation. */
export interface LoginInput {
  email: string;
  password: string;
}

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Login-specific error codes.
 */
export const LOGIN_ERRORS = {
  INVALID_BODY: "INVALID_BODY",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
} as const;

/* ------------------------------------------------------------------ */
/*  Rate limiter                                                       */
/* ------------------------------------------------------------------ */

/**
 * In-memory rate-limit bucket for a given IP.
 */
interface RateLimitBucket {
  /** Sorted array of attempt timestamps (Unix epoch ms). */
  attempts: number[];
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Check (and optionally record) login attempts for an IP address.
 *
 * @param ip — Client IP address string.
 * @param record — If true, record this attempt after checking.
 * @returns `{ allowed: true }` if under the limit, or `{ allowed: false, retryAfterSeconds }` if exceeded.
 */
export function checkRateLimit(ip: string, record = false): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = rateLimitStore.get(ip);

  if (!bucket) {
    bucket = { attempts: [] };
    rateLimitStore.set(ip, bucket);
  }

  // Purge attempts outside the current window
  const windowStart = now - WINDOW_MS;
  bucket.attempts = bucket.attempts.filter((t) => t > windowStart);

  if (bucket.attempts.length >= MAX_ATTEMPTS) {
    // Calculate seconds until the oldest attempt expires from the window
    const oldest = bucket.attempts[0];
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  if (record) {
    bucket.attempts.push(now);
  }

  return { allowed: true };
}

/**
 * Clear the rate-limit store (useful in tests).
 */
export function clearRateLimitStore() {
  rateLimitStore.clear();
}

/* ------------------------------------------------------------------ */
/*  Login result                                                       */
/* ------------------------------------------------------------------ */

/**
 * Return type for `loginUser`.
 */
export interface LoginResult {
  /** Whether the login succeeded. */
  success: boolean;
  /** HTTP status code to return. */
  status: number;
  /** Error code for the response. */
  code: string;
  /** Error message for the response. */
  message: string;
  /** Retry-after seconds when rate limited. */
  retryAfterSeconds?: number;
  /** Sanitised user object on success. */
  user: Record<string, unknown> | null;
  /** Session cookie header string on success. */
  cookie: string | null;
}

/* ------------------------------------------------------------------ */
/*  Service function                                                   */
/* ------------------------------------------------------------------ */

/**
 * Prisma user shape used by the login service.
 */
interface PrismaUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  roles: string[];
  status: string;
  emailVerified: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const userResponseFields = {
  id: true,
  email: true,
  displayName: true,
  roles: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Authenticate a user by email + password.
 *
 * @param prisma — PrismaClient instance (injected for testability).
 * @param input  — Validated login payload.
 * @param ip     — Client IP address for rate limiting.
 * @returns LoginResult with status code, user envelope, and cookie.
 */
export async function loginUser(
  prisma: {
    user: {
      findUnique: (args: { where: { email: string } }) => Promise<PrismaUser | null>;
    };
  },
  input: LoginInput,
  ip: string,
): Promise<LoginResult> {
  // 1. Rate limit check — reject if too many failed attempts
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return {
      success: false,
      status: 429,
      code: LOGIN_ERRORS.RATE_LIMIT_EXCEEDED,
      message: "Too many failed login attempts. Please try again later.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      user: null,
      cookie: null,
    };
  }

  // 2. Normalise email defensively
  const normalisedEmail = input.email.toLowerCase();

  // 3. Look up user
  const user = await prisma.user.findUnique({ where: { email: normalisedEmail } });

  if (!user) {
    // Record the failed attempt for rate limiting but use a generic message
    checkRateLimit(ip, true);
    return {
      success: false,
      status: 401,
      code: LOGIN_ERRORS.INVALID_CREDENTIALS,
      message: "Invalid email or password.",
      user: null,
      cookie: null,
    };
  }

  // 4. Verify password
  const match = await comparePassword(input.password, user.passwordHash);

  if (!match) {
    checkRateLimit(ip, true);
    return {
      success: false,
      status: 401,
      code: LOGIN_ERRORS.INVALID_CREDENTIALS,
      message: "Invalid email or password.",
      user: null,
      cookie: null,
    };
  }

  // 5. Build sanitized user response (passwordHash excluded by select)
  const sanitizedUser = sanitizePasswordHash(user) as Record<string, unknown>;

  // 6. Generate JWT session token (7-day TTL)
  const token = generateToken({
    sub: sanitizedUser.id as string,
    role: Array.isArray(sanitizedUser.roles)
      ? (sanitizedUser.roles[0] as UserRole)
      : ("LISTENER" as UserRole),
  });

  // 7. Build Set-Cookie header
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=604800`,
  ];
  const cookie = cookieParts.join("; ");

  return {
    success: true,
    status: 200,
    code: "OK",
    message: "Login successful.",
    user: sanitizedUser,
    cookie,
  };
}

/**
 * STORY-security-001: Password hashing, verification, payload sanitization,
 * and Prisma query wrapper utilities.
 *
 * Uses bcrypt (bcryptjs) with cost factor 12 and 16-byte random salt.
 * Sanitization helpers prevent passwordHash leakage in API responses,
 * Prisma query selects, and log streams per sec-024.
 */

import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bcrypt cost factor — controls computational work (2^cost operations). */
const BCRYPT_COST = 12;

/** Fields to redact from log payloads (sec-024 sensitive data rules). */
const LOG_REDACT_FIELDS = new Set(['password', 'oldPassword', 'newPassword', 'passwordHash', 'password_hash']);

// ---------------------------------------------------------------------------
// Hashing & Verification
// ---------------------------------------------------------------------------

/**
 * Hash a plain-text password with bcrypt using cost factor 12.
 * The 16-byte random salt is embedded in the returned hash string.
 *
 * @param password - Plain-text password to hash
 * @returns A bcrypt-compatible hash string (60 chars, $2b$12$...)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Compare a plain-text password against a stored bcrypt hash.
 *
 * @param password - Plain-text password to verify
 * @param hash - Stored bcrypt hash string
 * @returns true if the password matches, false otherwise
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Payload Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip passwordHash (and password_hash) from a plain User model object
 * before JSON serialization / API response.
 *
 * Returns a shallow copy without the sensitive fields.  Handles null,
 * undefined, and non-object values gracefully.
 *
 * @param obj - Object that may contain passwordHash
 * @returns A copy of obj without passwordHash, or the original value unchanged
 */
export function sanitizePasswordHash(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (!Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    const copy = { ...record };
    delete copy.passwordHash;
    delete copy.password_hash;
    return copy;
  }

  // arrays: recurse into each element
  return (obj as unknown[]).map((item) => sanitizePasswordHash(item));
}

/**
 * Deep-sanitize any JSON-serialisable value, recursively removing
 * passwordHash / password_hash keys from nested objects and arrays.
 *
 * Returns a cloned (deep-copied) structure with sensitive fields removed.
 * Does NOT mutate the original input.
 *
 * @param value - Arbitrary JSON value
 * @returns A sanitized clone
 */
export function sanitizeObject(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // --- arrays ---
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }

  // --- plain objects ---
  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    if (key === 'passwordHash' || key === 'password_hash') continue;
    sanitized[key] = sanitizeObject(val);
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Prisma Query Select Wrapper
// ---------------------------------------------------------------------------

let _cachedSelect: Record<string, boolean> | null = null;

/**
 * Prisma select object that selects every field on the User model
 * *except* passwordHash / password_hash.  Memoised for repeated use.
 *
 * In a real Prisma query you'd spread this as:
 *   prisma.user.findMany({ select: { ...prismaUserSelect(), ...extra } })
 *
 * This prevents developers from accidentally leaking the field in
 * any query that uses the helper.
 */
export function prismaUserSelect(): Record<string, boolean> {
  if (_cachedSelect) {
    return _cachedSelect;
  }

  const select: Record<string, boolean> = {
    id: true,
    email: true,
    displayName: true,
    roles: true,
    status: true,
    emailVerified: true,
    emailVerifiedAt: true,
    tokenInvalidatedBefore: true,
    createdAt: true,
    updatedAt: true,
    // passwordHash / password_hash deliberately omitted
  };

  _cachedSelect = select;
  return select;
}

// ---------------------------------------------------------------------------
// Log / Error Sanitization  (sec-024)
// ---------------------------------------------------------------------------

/**
 * Recursively redact sensitive credential fields from a log payload
 * so that password hashes or plaintext passwords never leak into
 * application logs, error stacks, or monitoring systems.
 *
 * Fields redacted (case-sensitive keys):
 *   password | oldPassword | newPassword | passwordHash | password_hash
 *
 * Returns a deep clone; original object is not mutated.
 *
 * @param value - Arbitrary log payload value
 * @returns Sanitized clone
 */
export function sanitizeLogPayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogPayload(item));
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    if (LOG_REDACT_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeLogPayload(val);
    }
  }

  return sanitized;
}

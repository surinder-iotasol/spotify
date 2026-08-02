/**
 * STORY-auth-004a: Recursive password field sanitizer.
 *
 * Strips `password`, `oldPassword`, `newPassword` keys from any
 * nested JSON object or array, returning a new sanitized copy
 * without mutating the original.
 */

// Fields to redact from JSON payloads
const SENSITIVE_FIELDS = new Set(['password', 'oldPassword', 'newPassword']);

/**
 * Recursively strip password, oldPassword, newPassword keys from a
 * JSON-serialisable value, returning a new sanitized clone.
 *
 * @param value - Arbitrary JSON value (object, array, primitive, null)
 * @returns A deep clone with sensitive fields removed, or the original value unchanged
 */
export function sanitizePassword(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // --- arrays: recurse into each element ---
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePassword(item));
  }

  // --- plain objects ---
  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    if (SENSITIVE_FIELDS.has(key)) continue;
    sanitized[key] = sanitizePassword(val);
  }

  return sanitized;
}

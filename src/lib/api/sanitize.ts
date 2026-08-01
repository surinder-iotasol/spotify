/**
 * Request body sanitization middleware.
 *
 * Intercepts incoming request bodies on API routes and replaces
 * sensitive field values (password, secret, token, etc.) with
 * `[REDACTED]` before they reach loggers or error payloads.
 */

import { SENSITIVE_FIELDS } from "./response";

/**
 * The list of field names considered sensitive and redacted from
 * request bodies and error outputs.
 */
export const SENSITIVE_FIELD_NAMES = SENSITIVE_FIELDS;

/* ------------------------------------------------------------------ */
/*  Sanitization helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Deeply sanitize a request body object by replacing sensitive field
 * values with `[REDACTED]`.
 *
 * Operates recursively on nested objects and arrays.
 */
export function sanitizeRequestBody(body: unknown): unknown {
  if (body === null || typeof body !== "object") {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeRequestBody(item));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_FIELD_NAMES.includes(key)) {
      // Redact top-level sensitive values; recurse into nested objects
      // so inner fields can still be sanitized individually.
      if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitizeRequestBody(value);
      } else {
        sanitized[key] = "[REDACTED]";
      }
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeRequestBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a structured error object for safe logging.
 *
 * Recursively walks the object and redacts sensitive fields.
 * Preserves the original structure so log aggregators still parse correctly.
 */
export function sanitizeErrorForLogging(
  error: unknown,
): Record<string, unknown> {
  if (error === null) return {};

  // Handle native Error instances — their properties (message, name, stack)
  // are non-enumerable, so Object.entries misses them.
  if (error instanceof Error) {
    const sanitized: Record<string, unknown> = { message: error.message };
    if (error.name) sanitized.name = error.name;
    if (error.stack) sanitized.stack = "[REDACTED]";
    return sanitized;
  }

  if (typeof error !== "object") {
    return { message: String(error) };
  }

  if (Array.isArray(error)) {
    return error.map((item) =>
      typeof item === "object" && item !== null
        ? sanitizeErrorForLogging(item)
        : String(item),
    ) as unknown as Record<string, unknown>;
  }

  const sanitized: Record<string, unknown> = {};
  const errorObj = error as Record<string, unknown>;

  for (const [key, value] of Object.entries(errorObj)) {
    if (SENSITIVE_FIELD_NAMES.includes(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeErrorForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Check whether a given string is the name of a sensitive field.
 */
export function isSensitiveField(name: string): boolean {
  return SENSITIVE_FIELD_NAMES.includes(name);
}

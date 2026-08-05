/**
 * STORY-track-005c: Logging utility for track registration failures.
 *
 * Provides structured error logging for track registration failures
 * with sanitized PII metadata, following the sister cross-cutting
 * guideline sec-025 (sensitive data redaction in logs).
 *
 * Usage (in route handlers / services):
 *   // Build input object with metadata fields to include
 *   // console.error received with structured log + sanitized PII
 */

import { sanitizeErrorForLogging, sanitizeRequestBody } from "./api/sanitize";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Structured fields emitted in track registration failure logs.
 * All PII-sensitive values are pre-sanitized by the logging helper.
 */
export interface TrackRegistrationFailureMeta {
  /** Machine-readable error code (e.g. "VALIDATION_ERROR", "STORAGE_KEY_NOT_FOUND") */
  errorCode: string;
  /** Human-readable error message. */
  errorMessage: string | undefined;
  /** Optional PII metadata (title, genre, artistProfileId, etc.) — sanitized before log. */
  metadata?: Record<string, unknown>;
  /** Raw error object — sanitized (stack trace redacted) before log. */
  error?: unknown;
  /** Optional list of sanitized validation detail objects. */
  validationErrors?: Array<Record<string, unknown>>;
  /** Optional HTTP response status code for the failure. */
  httpStatus?: number;
}

/* ------------------------------------------------------------------ */
/*  Exported logging function                                          */
/* ------------------------------------------------------------------ */

/**
 * Log a track registration failure event with sanitized PII metadata.
 *
 * Uses `console.error` to emit a structured JSON object containing:
 * - `logSource: "track-registration-failure"`
 * - `story: "STORY-track-005c"`
 * - `errorCode` and `errorMessage`
 * - `metadata` (sanitized via `sanitizeRequestBody`)
 * - `error` (sanitized via `sanitizeErrorForLogging; stack trace redacted)
 * - `validationErrors` (sanitized)
 * - `timestamp`
 *
 * This ensures no PII or sensitive data (passwords, tokens, secrets) appears
 * in logs, per sec-025.
 */
export function logTrackRegistrationFailure(meta: TrackRegistrationFailureMeta): void {
  const logEntry: Record<string, unknown> = {
    logSource: "track-registration-failure",
    story: "STORY-track-005c",
    errorCode: meta.errorCode,
    timestamp: new Date().toISOString(),
    errorMessage: meta.errorMessage ?? null,
  };

  if (meta.metadata) {
    logEntry.metadata = sanitizeRequestBody(meta.metadata);
  }

  if (meta.error) {
    logEntry.error = sanitizeErrorForLogging(meta.error);
  }

  if (meta.validationErrors && meta.validationErrors.length > 0) {
    logEntry.validationErrors = meta.validationErrors.map((err) => sanitizeErrorForLogging(err));
  }

  if (meta.httpStatus) {
    logEntry.httpStatus = meta.httpStatus;
  }

  console.error(JSON.stringify(logEntry));
}

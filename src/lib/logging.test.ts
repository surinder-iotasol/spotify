/**
 * STORY-track-005c: Unit tests for track registration failure logging.
 *
 * Verifies structured log output with sanitized PII metadata.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logTrackRegistrationFailure } from "./logging";
import type { TrackRegistrationFailureMeta } from "./logging";

describe("logTrackRegistrationFailure", () => {
  let captured: string;
  let originalError: typeof globalThis.console.error;

  beforeEach(() => {
    captured = "";
    originalError = console.error;
    console.error = (msg: string) => {
      captured = typeof msg === "string" ? msg : JSON.stringify(msg);
    };
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("emits a JSON object with logSource and story fields", () => {
    logTrackRegistrationFailure({ errorCode: "VALIDATION_ERROR" });
    const entry = JSON.parse(captured);
    expect(entry.logSource).toBe("track-registration-failure");
    expect(entry.story).toBe("STORY-track-005c");
    expect(entry.errorCode).toBe("VALIDATION_ERROR");
    expect(entry).toHaveProperty("timestamp");
  });

  it("includes errorMessage when provided", () => {
    logTrackRegistrationFailure({
      errorCode: "STORAGE_KEY_NOT_FOUND",
      errorMessage: "Key does not exist",
    });
    const entry = JSON.parse(captured);
    expect(entry.errorMessage).toBe("Key does not exist");
  });

  it("sets errorMessage to null when omitted", () => {
    logTrackRegistrationFailure({ errorCode: "GENERIC_ERROR" });
    const entry = JSON.parse(captured);
    expect(entry.errorMessage).toBeNull();
  });

  it("includes httpStatus when provided", () => {
    logTrackRegistrationFailure({
      errorCode: "VALIDATION_ERROR",
      httpStatus: 422,
    });
    const entry = JSON.parse(captured);
    expect(entry.httpStatus).toBe(422);
  });

  it("omits httpStatus when omitted", () => {
    logTrackRegistrationFailure({ errorCode: "GENERIC_ERROR" });
    const entry = JSON.parse(captured);
    expect(entry.httpStatus).toBeUndefined();
  });

  it("sanitizes metadata by redacting sensitive fields", () => {
    logTrackRegistrationFailure({
      errorCode: "VALIDATION_ERROR",
      metadata: {
        title: "My Song",
        genre: "rock",
        password: "supersecret",
        apiKey: "sk-12345",
      },
    });
    const entry = JSON.parse(captured);
    expect(entry.metadata).toBeDefined();
    const meta = entry.metadata as Record<string, unknown>;
    expect(meta.title).toBe("My Song");
    expect(meta.genre).toBe("rock");
    expect(meta.password).toBe("[REDACTED]");
    expect(meta.apiKey).toBe("[REDACTED]");
  });

  it("sanitizes metadata with nested objects", () => {
    logTrackRegistrationFailure({
      errorCode: "VALIDATION_ERROR",
      metadata: {
        artist: {
          name: "Band",
          password: "nestedsecret",
        },
      },
    });
    const entry = JSON.parse(captured);
    const meta = entry.metadata as Record<string, unknown>;
    const artist = meta.artist as Record<string, unknown>;
    expect(artist.name).toBe("Band");
    expect(artist.password).toBe("[REDACTED]");
  });

  it("sanitizes error details via sanitizeErrorForLogging", () => {
    logTrackRegistrationFailure({
      errorCode: "AUTH_ERROR",
      error: {
        detail: "auth failed",
        password: "hackme",
        apiKey: "abc123",
      },
    });
    const entry = JSON.parse(captured);
    const err = entry.error as Record<string, unknown>;
    expect(err.detail).toBe("auth failed");
    expect(err.password).toBe("[REDACTED]");
    expect(err.apiKey).toBe("[REDACTED]");
  });

  it("sanitizes validation errors array with each item redacted", () => {
    logTrackRegistrationFailure({
      errorCode: "VALIDATION_ERROR",
      validationErrors: [
        { field: "title", message: "required", password: "leak" },
        { field: "genre", message: "invalid" },
      ],
    });
    const entry = JSON.parse(captured);
    const verrors = entry.validationErrors as Record<string, unknown>[];
    expect(Array.isArray(verrors)).toBe(true);
    expect(verrors.length).toBe(2);
    expect(verrors[0].field).toBe("title");
    expect(verrors[0].password).toBe("[REDACTED]");
    expect(verrors[1].field).toBe("genre");
  });

  it("omits validationErrors when empty array", () => {
    logTrackRegistrationFailure({
      errorCode: "GENERIC_ERROR",
      validationErrors: [],
    });
    const entry = JSON.parse(captured);
    expect(entry.validationErrors).toBeUndefined();
  });

  it("omits error field when not provided", () => {
    logTrackRegistrationFailure({ errorCode: "OTHER_ERROR" });
    const entry = JSON.parse(captured);
    expect(entry.error).toBeUndefined();
  });

  it("omits metadata field when not provided", () => {
    logTrackRegistrationFailure({ errorCode: "OTHER_ERROR" });
    const entry = JSON.parse(captured);
    expect(entry.metadata).toBeUndefined();
  });
});

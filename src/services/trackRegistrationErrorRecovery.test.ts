/**
 * STORY-track-005d: Unit tests for Track Registration Error Recovery Handlers
 *
 * Covers:
 * - cleanupOrphanedStorage: verifies StorageProvider.deleteObject is called
 *   for both audioStorageKey and coverImageStorageKey, and that deletion
 *   failures are silently tolerated.
 * - generateCorruptedAudioEnvelope: verifies HTTP 422 with CORRUPTED_AUDIO_FILE.
 * - generateKeyNotFoundEnvelope: verifies HTTP 404 with STORAGE_KEY_NOT_FOUND.
 * - handleRegistrationError: combines cleanup + envelope generation for all
 *   error types (CorruptedAudioError, KeyNotFoundError, unknown errors).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — module paths must resolve before any real import   */
/* ------------------------------------------------------------------ */

vi.mock("@/services/audioMetadata", () => ({
  CorruptedAudioError: class CorruptedAudioError extends Error {
    override name = "CorruptedAudioError";
    storageKey?: string;
    constructor(message?: string, storageKey?: string) {
      super(message ?? "Audio file is corrupted or unreadable");
      this.storageKey = storageKey;
    }
  },
  KeyNotFoundError: class KeyNotFoundError extends Error {
    override name = "KeyNotFoundError";
    readonly key: string;
    constructor(message: string, key: string) {
      super(message);
      this.key = key;
    }
  },
}));

vi.mock("@/lib/storage/storage-provider", () => ({
  createStorageProvider: vi.fn((config: Record<string, string>) => {
    // Capture config for env-based assertions
    (createStorageProvider as any).lastConfig = config;
    return {
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock("@/lib/api/response", () => ({
  apiErrorResponse: vi.fn(
    (code: string, message: string, _details?: unknown) => ({
      success: false,
      error: { code, message, details: undefined },
      meta: {
        timestamp: "2025-06-01T00:00:00.000Z",
        requestId: "req-test-001",
      },
    }),
  ),
}));

/* ------------------------------------------------------------------ */
/*  Imports — after mocks are hoisted                                  */
/* ------------------------------------------------------------------ */

import { KeyNotFoundError, CorruptedAudioError } from "@/services/audioMetadata";
import { apiErrorResponse } from "@/lib/api/response";
import { createStorageProvider } from "@/lib/storage/storage-provider";
import {
  cleanupOrphanedStorage,
  generateCorruptedAudioEnvelope,
  generateKeyNotFoundEnvelope,
  handleRegistrationError,
} from "./trackRegistrationErrorRecovery";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clearEnv(): void {
  delete process.env.S3_BUCKET_NAME;
  delete process.env.AWS_REGION;
  delete process.env.S3_ENDPOINT;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
}

function cleanupCtx(overrides?: { audioKey?: string; coverKey?: string }) {
  return {
    audioStorageKey:
      overrides?.audioKey ?? "audio/ap-001/track-1/abc123.mp3",
    coverImageStorageKey: overrides?.coverKey ?? "covers/artist1/cover.jpg",
  };
}

function getDeleteMock() {
  const provider = (createStorageProvider as any).mock.results?.[0]?.value;
  return provider?.deleteObject as ReturnType<typeof vi.fn>;
}

function getConfig() {
  return (createStorageProvider as any).lastConfig;
}

/* ------------------------------------------------------------------ */
/*  Setup/teardown                                                     */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  clearEnv();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  cleanupOrphanedStorage tests                                       */
/* ------------------------------------------------------------------ */

describe("cleanupOrphanedStorage", () => {
  it("calls deleteObject on audioStorageKey", async () => {
    const ctx = cleanupCtx();
    await cleanupOrphanedStorage(ctx);
    const deleteMock = getDeleteMock();
    expect(deleteMock).toHaveBeenCalledWith(ctx.audioStorageKey);
  });

  it("calls deleteObject on coverImageStorageKey when present", async () => {
    const ctx = cleanupCtx({
      coverKey: "covers/artist1/cover.jpg",
    });
    await cleanupOrphanedStorage(ctx);
    const deleteMock = getDeleteMock();
    expect(deleteMock).toHaveBeenCalledWith(ctx.coverImageStorageKey);
  });

  it("does NOT call deleteObject on coverImageStorageKey when omitted", async () => {
    const ctx = cleanupCtx({ coverKey: undefined });
    await cleanupOrphanedStorage(ctx);
    const deleteMock = getDeleteMock();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(ctx.audioStorageKey);
  });

  it("tolerates deletion errors on audioStorageKey without throwing", async () => {
    vi.mocked(getDeleteMock()).mockRejectedValueOnce(
      new Error("S3 error"),
    );
    await expect(cleanupOrphanedStorage(cleanupCtx())).resolves.toBeUndefined();
  });

  it("tolerates deletion errors on coverImageStorageKey without throwing", async () => {
    const deleteMock = getDeleteMock();
    deleteMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("S3 error"));

    await expect(cleanupOrphanedStorage(cleanupCtx())).resolves.toBeUndefined();
  });

  it("uses S3 env vars when creating storage provider", async () => {
    process.env.S3_BUCKET_NAME = "my-bucket";
    process.env.AWS_REGION = "eu-west-1";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.AWS_ACCESS_KEY_ID = "AKIA123";
    process.env.AWS_SECRET_ACCESS_KEY = "secret456";

    const ctx = cleanupCtx();
    await cleanupOrphanedStorage(ctx);

    const cfg = getConfig();
    expect(cfg.bucket).toBe("my-bucket");
    expect(cfg.region).toBe("eu-west-1");
    expect(cfg.endpoint).toBe("http://localhost:9000");
    expect(cfg.accessKeyId).toBe("AKIA123");
    expect(cfg.secretAccessKey).toBe("secret456");
  });

  it("uses defaults when env vars are absent", async () => {
    const ctx = cleanupCtx();
    await cleanupOrphanedStorage(ctx);

    const cfg = getConfig();
    expect(cfg.bucket).toBe("");
    expect(cfg.region).toBe("us-east-1");
    expect(cfg.accessKeyId).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/*  generateCorruptedAudioEnvelope tests                               */
/* ------------------------------------------------------------------ */

describe("generateCorruptedAudioEnvelope", () => {
  it("returns HTTP 422 status", () => {
    const envelope = generateCorruptedAudioEnvelope("audio/test.mp3");
    expect(envelope.status).toBe(422);
  });

  it("returns CORRUPTED_AUDIO_FILE as error code", () => {
    const envelope = generateCorruptedAudioEnvelope("audio/test.mp3");
    const body = envelope.body as Record<string, unknown>;
    expect((body.error as Record<string, string>).code).toBe(
      "CORRUPTED_AUDIO_FILE",
    );
  });

  it("includes failure message in envelope body", () => {
    const envelope = generateCorruptedAudioEnvelope("audio/test.mp3");
    const body = envelope.body as Record<string, unknown>;
    expect((body.error as Record<string, string>).message).toBe(
      "Audio file is corrupted or unreadable.",
    );
  });

  it("includes success: false in envelope", () => {
    const envelope = generateCorruptedAudioEnvelope("audio/test.mp3");
    const body = envelope.body as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("includes meta with timestamp and requestId", () => {
    const envelope = generateCorruptedAudioEnvelope("audio/test.mp3");
    const body = envelope.body as Record<string, unknown>;
    const meta = body.meta as Record<string, string>;
    expect(meta.timestamp).toBeDefined();
    expect(meta.requestId).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  generateKeyNotFoundEnvelope tests                                  */
/* ------------------------------------------------------------------ */

describe("generateKeyNotFoundEnvelope", () => {
  it("returns HTTP 404 status", () => {
    const envelope = generateKeyNotFoundEnvelope("audio/missing.mp3");
    expect(envelope.status).toBe(404);
  });

  it("returns STORAGE_KEY_NOT_FOUND as error code", () => {
    const envelope = generateKeyNotFoundEnvelope("audio/missing.mp3");
    const body = envelope.body as Record<string, unknown>;
    expect((body.error as Record<string, string>).code).toBe(
      "STORAGE_KEY_NOT_FOUND",
    );
  });

  it("includes the storage key in the error message", () => {
    const envelope = generateKeyNotFoundEnvelope("audio/missing.mp3");
    const body = envelope.body as Record<string, unknown>;
    const msg = (body.error as Record<string, string>).message;
    expect(msg).toContain("audio/missing.mp3");
  });

  it("includes success: false in envelope", () => {
    const envelope = generateKeyNotFoundEnvelope("audio/missing.mp3");
    const body = envelope.body as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  it("includes meta with timestamp and requestId", () => {
    const envelope = generateKeyNotFoundEnvelope("audio/missing.mp3");
    const body = envelope.body as Record<string, unknown>;
    const meta = body.meta as Record<string, string>;
    expect(meta.timestamp).toBeDefined();
    expect(meta.requestId).toBeDefined();
  });

  it("handles key with special characters", () => {
    const envelope = generateKeyNotFoundEnvelope(
      "audio/ap-001/track 1 (feat. remix).mp3",
    );
    const body = envelope.body as Record<string, unknown>;
    const msg = (body.error as Record<string, string>).message;
    expect(msg).toContain(
      "audio/ap-001/track 1 (feat. remix).mp3",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  handleRegistrationError tests                                      */
/* ------------------------------------------------------------------ */

describe("handleRegistrationError", () => {
  const ctx = cleanupCtx();

  it("calls cleanupOrphanedStorage for CorruptedAudioError", async () => {
    const error = new CorruptedAudioError("bad header");
    await handleRegistrationError(error, ctx);

    const deleteMock = getDeleteMock();
    expect(deleteMock).toHaveBeenCalledWith(ctx.audioStorageKey);
  });

  it("returns 422 CORRUPTED_AUDIO_FILE for CorruptedAudioError", async () => {
    const error = new CorruptedAudioError("bad header");
    const envelope = await handleRegistrationError(error, ctx);

    expect(envelope.status).toBe(422);
    const body = envelope.body as Record<string, unknown>;
    expect((body.error as Record<string, string>).code).toBe(
      "CORRUPTED_AUDIO_FILE",
    );
  });

  it("calls cleanupOrphanedStorage for KeyNotFoundError", async () => {
    const error = new KeyNotFoundError("Key not found", "audio/missing.mp3");
    await handleRegistrationError(error, ctx);

    const deleteMock = getDeleteMock();
    expect(deleteMock).toHaveBeenCalledWith(ctx.audioStorageKey);
  });

  it("returns 404 STORAGE_KEY_NOT_FOUND for KeyNotFoundError", async () => {
    const error = new KeyNotFoundError("Key not found", "audio/missing.mp3");
    const envelope = await handleRegistrationError(error, ctx);

    expect(envelope.status).toBe(404);
    const body = envelope.body as Record<string, unknown>;
    expect((body.error as Record<string, string>).code).toBe(
      "STORAGE_KEY_NOT_FOUND",
    );
  });

  it("returns 404 envelope with the error key when present", async () => {
    const key = "audio/definitely-gone.mp3";
    const error = new KeyNotFoundError("Not found", key);
    const envelope = await handleRegistrationError(error, ctx);

    const body = envelope.body as Record<string, unknown>;
    const msg = (body.error as Record<string, string>).message;
    expect(msg).toContain(key);
  });

  it("returns 500 INTERNAL_ERROR for unknown errors", async () => {
    const error = new TypeError("Something went wrong");
    const envelope = await handleRegistrationError(error, ctx);

    expect(envelope.status).toBe(500);
    const body = envelope.body as Record<string, unknown>;
    expect((body.error as Record<string, string>).code).toBe(
      "INTERNAL_ERROR",
    );
  });

  it("still calls cleanup for unknown errors", async () => {
    const error = new Error("unknown failure");
    await handleRegistrationError(error, ctx);

    const deleteMock = getDeleteMock();
    expect(deleteMock).toHaveBeenCalledWith(ctx.audioStorageKey);
  });

  it("tolerates cleanup deletion errors on CorruptedAudioError path", async () => {
    vi.mocked(getDeleteMock()).mockRejectedValueOnce(
      new Error("S3 gone"),
    );
    const error = new CorruptedAudioError("bad header");

    await expect(
      handleRegistrationError(error, ctx),
    ).resolves.toBeDefined();
  });
});

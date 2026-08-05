/**
 * STORY-track-005e: Integration test for corrupted file upload flow.
 *
 * Simulates the full track-registration error path where an uploaded audio
 * file has a corrupted header.  Verifies that:
 *  • storage cleanup (deleteObject) is executed for both audio and cover keys
 *  • a 422 error envelope is returned with code CORRUPTED_AUDIO_FILE
 *  • the handleRegistrationError path correctly maps CorruptedAudioError → cleanup → 422
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ── Hoisted mocks ────────────────────────────────────────────────── */

let deleteMock: ReturnType<typeof vi.fn>;

vi.mock("@/services/audioMetadata", () => ({
  CorruptedAudioError: class CorruptedAudioError extends Error {
    override name = "CorruptedAudioError";
    storageKey?: string;
    readonly key: string;
    constructor(message: string, key: string) {
      super(message);
      this.key = key;
      this.storageKey = key;
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
    deleteMock = vi.fn().mockResolvedValue(undefined);
    return {
      deleteObject: deleteMock,
      readHeaderBytes: vi.fn().mockResolvedValue(Buffer.from("")),
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
  apiSuccessResponse: vi.fn(),
}));

/* ── Imports (after mocks) ───────────────────────────────────────── */

import { CorruptedAudioError } from "@/services/audioMetadata";
import {
  cleanupOrphanedStorage,
  generateCorruptedAudioEnvelope,
  handleRegistrationError,
} from "@/services/trackRegistrationErrorRecovery";

/* ── Helpers ─────────────────────────────────────────────────────── */

function clearEnv(): void {
  delete process.env.S3_BUCKET_NAME;
  delete process.env.AWS_REGION;
  delete process.env.S3_ENDPOINT;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
}

function cleanupCtx(overrides?: {
  audioKey?: string;
  coverKey?: string | undefined;
}) {
  const audioKey =
    (overrides?.audioKey ??
      "audio/ap-001/track-1/corrupted-file-abc123.mp3") as string;
  const coverKey =
    typeof overrides?.coverKey === "undefined"
      ? "covers/ap-001/track-1/cover.jpg"
      : (overrides.coverKey ?? undefined);
  return {
    audioStorageKey: audioKey,
    coverImageStorageKey: coverKey,
  };
}

/* ── Setup / teardown ────────────────────────────────────────────── */

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

/* ── Tests ───────────────────────────────────────────────────────── */

describe("POST /api/v1/tracks — corrupted audio upload flow (integration)", () => {
  describe("handleRegistrationError with CorruptedAudioError", () => {
    const ERR_MSG = "Audio file is corrupted or unreadable";
    const AUDIO_KEY = "audio/ap-001/track-1/corrupted-file-abc123.mp3";
    const COVER_KEY = "covers/ap-001/track-1/cover.jpg";

    it("returns status 422 with CORRUPTED_AUDIO_FILE envelope", async () => {
      const error = new CorruptedAudioError(ERR_MSG, AUDIO_KEY);
      const ctx = cleanupCtx({ audioKey: AUDIO_KEY, coverKey: COVER_KEY });

      const result = await handleRegistrationError(error, ctx);

      expect(result.status).toBe(422);
      expect(result.body).toHaveProperty("success", false);
      expect((result.body as any).error.code).toBe("CORRUPTED_AUDIO_FILE");
      expect((result.body as any).error.message).toBe(
        "Audio file is corrupted or unreadable.",
      );
    });

    it("deletes the orphaned audio key from storage", async () => {
      const error = new CorruptedAudioError(ERR_MSG, AUDIO_KEY);
      const ctx = cleanupCtx({ audioKey: AUDIO_KEY, coverKey: COVER_KEY });

      await handleRegistrationError(error, ctx);

      expect(deleteMock).toHaveBeenCalledWith(AUDIO_KEY);
    });

    it("deletes the orphaned cover image key from storage", async () => {
      const error = new CorruptedAudioError(ERR_MSG, AUDIO_KEY);
      const ctx = cleanupCtx({ audioKey: AUDIO_KEY, coverKey: COVER_KEY });

      await handleRegistrationError(error, ctx);

      expect(deleteMock).toHaveBeenCalledWith(COVER_KEY);
    });

    it("calls deleteObject exactly twice for audio + cover", async () => {
      const error = new CorruptedAudioError(ERR_MSG, AUDIO_KEY);
      const ctx = cleanupCtx({ audioKey: AUDIO_KEY, coverKey: COVER_KEY });

      await handleRegistrationError(error, ctx);

      expect(deleteMock).toHaveBeenCalledTimes(2);
    });

    it("calls deleteObject once when no cover key is provided", async () => {
      const error = new CorruptedAudioError(ERR_MSG, AUDIO_KEY);
      const ctx: import("@/services/trackRegistrationErrorRecovery").CleanupContext = {
        audioStorageKey: AUDIO_KEY,
        coverImageStorageKey: undefined,
      };

      await handleRegistrationError(error, ctx);

      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledWith(AUDIO_KEY);
    });

    it("combines cleanup + correct envelope in a single call chain", async () => {
      const error = new CorruptedAudioError(ERR_MSG, AUDIO_KEY);
      const ctx = cleanupCtx({ audioKey: AUDIO_KEY, coverKey: COVER_KEY });

      const result = await handleRegistrationError(error, ctx);

      // deleteObject was called before returning the envelope (side-effect)
      expect(deleteMock).toHaveBeenCalledWith(AUDIO_KEY);
      expect(deleteMock).toHaveBeenCalledWith(COVER_KEY);

      // and the returned envelope is the correct 422
      expect(result.status).toBe(422);
      expect((result.body as any).error.code).toBe("CORRUPTED_AUDIO_FILE");
    });
  });

  describe("generateCorruptedAudioEnvelope (standalone)", () => {
    it("returns 422 status", () => {
      const key = "audio/ap-001/track-1/bad.mp3";
      const result = generateCorruptedAudioEnvelope(key);
      expect(result.status).toBe(422);
    });

    it("returns CORRUPTED_AUDIO_FILE error code", () => {
      const key = "audio/ap-001/track-1/bad.mp3";
      const result = generateCorruptedAudioEnvelope(key);
      expect((result.body as any).error.code).toBe("CORRUPTED_AUDIO_FILE");
      expect((result.body as any).success).toBe(false);
    });
  });

  describe("cleanupOrphanedStorage (standalone)", () => {
    it("deletes both audio and cover keys", async () => {
      const audioKey = "audio/ap-001/track-1/corrupted.mp3";
      const coverKey = "covers/ap-001/track-1/cover.webp";
      const ctx = { audioStorageKey: audioKey, coverImageStorageKey: coverKey };

      await cleanupOrphanedStorage(ctx);

      expect(deleteMock).toHaveBeenCalledTimes(2);
      expect(deleteMock).toHaveBeenCalledWith(audioKey);
      expect(deleteMock).toHaveBeenCalledWith(coverKey);
    });

    it("deletes only audio key when cover missing", async () => {
      const ctx = { audioStorageKey: "audio/ap-001/track-1/no-cover.mp3" };

      await cleanupOrphanedStorage(ctx);

      expect(deleteMock).toHaveBeenCalledTimes(1);
    });
  });
});

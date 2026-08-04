/**
 * STORY-track-001: Unit tests for upload intent service.
 *
 * Verifies:
 * - Audio MIME type validation (audio/mpeg, audio/wav only)
 * - Audio file size enforcement (max 52,428,800 bytes / 50 MB)
 * - Cover image MIME type validation (image/jpeg, image/png, image/webp)
 * - Cover image file size enforcement (max 5 MB / 5,242,880 bytes)
 * - Presigned URL generation parameters (15-min TTL, ISO-8601 expiresAt)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import {
  validateAudioFile,
  validateCoverImage,
  generateStorageKey,
  generateUploadIntent,
  type UploadIntentInput,
  type ValidationResult,
} from "./uploadIntent";

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

// Mock the storage provider so presigned URL generation is deterministic.
vi.mock("@/lib/storage/storage-provider", () => ({
  createStorageProvider: vi.fn(() => ({
    generatePresignedUploadUrl: vi.fn(async (key: string, _opts?: unknown) => {
      return `https://presigned-url.example.com/${key}?token=fake-token`;
    }),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function makeAudioInput(overrides?: Partial<UploadIntentInput>): UploadIntentInput {
  return {
    fileType: "audio",
    fileName: "song.mp3",
    fileSizeBytes: 10_000_000,
    mimeType: "audio/mpeg",
    artistId: "artist-1",
    trackId: "track-1",
    ...overrides,
  };
}

function makeCoverInput(overrides?: Partial<UploadIntentInput>): UploadIntentInput {
  return {
    fileType: "cover",
    fileName: "cover.jpg",
    fileSizeBytes: 1_000_000,
    mimeType: "image/jpeg",
    artistId: "artist-1",
    trackId: "track-1",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Audio MIME type validation                                        */
/* ------------------------------------------------------------------ */

describe("validateAudioFile", () => {
  it("accepts audio/mpeg", () => {
    const result: ValidationResult = validateAudioFile("audio/mpeg", 5_000_000);
    expect(result.ok).toBe(true);
  });

  it("accepts audio/wav", () => {
    const result: ValidationResult = validateAudioFile("audio/wav", 5_000_000);
    expect(result.ok).toBe(true);
  });

  it("rejects audio/ogg", () => {
    const result: ValidationResult = validateAudioFile("audio/ogg", 5_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("INVALID_AUDIO_MIME_TYPE");
    }
  });

  it("rejects image/jpeg (wrong type)", () => {
    const result: ValidationResult = validateAudioFile("image/jpeg", 5_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("INVALID_AUDIO_MIME_TYPE");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Audio file size enforcement                                       */
/* ------------------------------------------------------------------ */

describe("validateAudioFile — size", () => {
  it("accepts file at exactly 50 MB", () => {
    const result: ValidationResult = validateAudioFile("audio/mpeg", 52_428_800);
    expect(result.ok).toBe(true);
  });

  it("rejects file exceeding 50 MB by 1 byte", () => {
    const result: ValidationResult = validateAudioFile("audio/mpeg", 52_428_801);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("AUDIO_FILE_TOO_LARGE");
    }
  });

  it("rejects 100 MB file", () => {
    const result: ValidationResult = validateAudioFile("audio/mpeg", 100 * 1024 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("AUDIO_FILE_TOO_LARGE");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Cover image MIME type validation                                  */
/* ------------------------------------------------------------------ */

describe("validateCoverImage", () => {
  it("accepts image/jpeg", () => {
    const result: ValidationResult = validateCoverImage("image/jpeg", 1_000_000);
    expect(result.ok).toBe(true);
  });

  it("accepts image/png", () => {
    const result: ValidationResult = validateCoverImage("image/png", 1_000_000);
    expect(result.ok).toBe(true);
  });

  it("accepts image/webp", () => {
    const result: ValidationResult = validateCoverImage("image/webp", 1_000_000);
    expect(result.ok).toBe(true);
  });

  it("rejects image/gif", () => {
    const result: ValidationResult = validateCoverImage("image/gif", 1_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("INVALID_COVER_IMAGE_MIME_TYPE");
    }
  });

  it("rejects audio/mpeg (wrong type)", () => {
    const result: ValidationResult = validateCoverImage("audio/mpeg", 1_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("INVALID_COVER_IMAGE_MIME_TYPE");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Cover image file size enforcement                                 */
/* ------------------------------------------------------------------ */

describe("validateCoverImage — size", () => {
  it("accepts file at exactly 5 MB", () => {
    const result: ValidationResult = validateCoverImage("image/jpeg", 5 * 1024 * 1024);
    expect(result.ok).toBe(true);
  });

  it("rejects file exceeding 5 MB by 1 byte", () => {
    const result: ValidationResult = validateCoverImage("image/jpeg", 5 * 1024 * 1024 + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("COVER_IMAGE_FILE_TOO_LARGE");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Storage key generation                                            */
/* ------------------------------------------------------------------ */

describe("generateStorageKey", () => {
  it("generates correct audio storage key", () => {
    const key = generateStorageKey("artist-1", "track-1", "audio", "audio/mpeg", "uuid-123");
    expect(key).toBe("audio/artist-1/track-1/uuid-123.mp3");
  });

  it("generates correct WAV storage key", () => {
    const key = generateStorageKey("artist-1", "track-1", "audio", "audio/wav", "uuid-123");
    expect(key).toBe("audio/artist-1/track-1/uuid-123.wav");
  });

  it("generates correct cover image storage key", () => {
    const key = generateStorageKey("artist-1", "track-1", "cover", "image/jpeg", "uuid-123");
    expect(key).toBe("covers/artist-1/track-1/uuid-123.webp");
  });
});

/* ------------------------------------------------------------------ */
/*  Presigned URL generation via generateUploadIntent                 */
/* ------------------------------------------------------------------ */

describe("generateUploadIntent", () => {
  it("returns 200 with audioUploadUrl, audioStorageKey, and expiresAt", async () => {
    const input: UploadIntentInput = makeAudioInput();

    const result = await generateUploadIntent(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data } = result;

    // Verify presigned URL format
    expect(data.audioUploadUrl).toMatch(/^https:\/\/presigned-url\.example\.com\//);
    expect(data.audioStorageKey).toMatch(/^audio\/artist-1\/track-1\//);
    // expiresAt should be an ISO-8601 UTC timestamp
    expect(new Date(data.expiresAt).toISOString()).toBe(data.expiresAt);
  });

  it("includes coverImageUploadUrl and coverImageStorageKey when cover is provided", async () => {
    const input: UploadIntentInput = makeAudioInput({
      coverFileName: "cover.jpg",
      coverFileSizeBytes: 500_000,
      coverMimeType: "image/jpeg",
    });

    const result = await generateUploadIntent(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data } = result;

    expect(data.coverImageUploadUrl).toMatch(/^https:\/\/presigned-url\.example\.com\//);
    expect(data.coverImageStorageKey).toMatch(/^covers\/artist-1\/track-1\//);
    expect(new Date(data.expiresAt).toISOString()).toBe(data.expiresAt);
  });

  it("rejects when audio MIME type is invalid", async () => {
    const input: UploadIntentInput = makeAudioInput({ mimeType: "audio/ogg" });
    const result = await generateUploadIntent(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "INVALID_AUDIO_MIME_TYPE")).toBe(true);
    }
  });

  it("rejects when audio file exceeds 50 MB", async () => {
    const input: UploadIntentInput = makeAudioInput({ fileSizeBytes: 60_000_000 });
    const result = await generateUploadIntent(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "AUDIO_FILE_TOO_LARGE")).toBe(true);
    }
  });

  it("rejects when cover image MIME type is invalid", async () => {
    const input: UploadIntentInput = makeAudioInput({
      coverMimeType: "image/gif",
      coverFileSizeBytes: 500_000,
      coverFileName: "cover.gif",
    });
    const result = await generateUploadIntent(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "INVALID_COVER_IMAGE_MIME_TYPE")).toBe(true);
    }
  });

  it("rejects when cover image exceeds 5 MB", async () => {
    const input: UploadIntentInput = makeAudioInput({
      coverMimeType: "image/jpeg",
      coverFileSizeBytes: 6_000_000,
      coverFileName: "cover.jpg",
    });
    const result = await generateUploadIntent(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "COVER_IMAGE_FILE_TOO_LARGE")).toBe(true);
    }
  });
});

/**
 * STORY-track-005e: Integration test for corrupted file upload flow.
 *
 * Simulates uploading a corrupted audio file and verifies:
 * - Storage cleanup is executed (deleteObject calls the cleanup path)
 * - HTTP 422 is returned
 * - Proper error envelope (CORRUPTED_AUDIO_FILE code, success: false error)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { generateToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                    */
/* ------------------------------------------------------------------ */

const mockArtistProfile = {
  id: "ap-001",
  userId: "user-123",
  stageName: "Test Artist",
  bio: null,
  avatarUrl: null,
  headerImageUrl: null,
  socialLinks: null,
  genreTags: null,
  isVerified: false,
  followerCount: 0,
  trackCount: 0,
  totalPlays: 0,
  totalLikes: 0,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        emailVerified: true,
        roles: ["ARTIST"],
      }),
    },
    artistProfile: {
      findUnique: vi.fn().mockResolvedValue(mockArtistProfile),
    },
    track: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/services/audioMetadata", () => {
  const extractAudioMetadata = vi.fn();
  return {
    extractAudioMetadata,
    CorruptedAudioError: class CorruptedAudioError extends Error {
      constructor(message: string, public readonly key: string) {
        super(message);
        this.name = "CorruptedAudioError";
      },
    },
    KeyNotFoundError: class KeyNotFoundError extends Error {
      public readonly key: string = "";
      constructor(message: string, key: string) {
        super(message);
        this.name = "KeyNotFoundError";
        this.key = key;
      },
    },
  };
});

vi.mock("@/lib/storage/storage-provider", () => ({
  createStorageProvider: vi.fn(() => ({
    deleteObject: vi.fn().mockResolvedValue(undefined),
    readHeaderBytes: vi.fn().mockResolvedValue(Buffer.from("fffb904c", "hex")),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Imports after mocks                                              */
/* ------------------------------------------------------------------ */

import { POST } from "./route";
import { extractAudioMetadata, CorruptedAudioError } from "@/services/audioMetadata";
import { createStorageProvider } from "@/lib/storage/storage-provider";
import prisma from "@/lib/prisma";

function getMockPrisma() {
  return prisma as unknown as {
    user: { findUnique: ReturnType<typeof vi.fn> };
    artistProfile: { findUnique: ReturnType<typeof vi.fn> };
    track: { create: ReturnType<typeof vi.fn> };
  };
}

function createMockRequest({
  body,
  cookie,
}: {
  body?: unknown;
  cookie?: string;
}): NextRequest {
  return {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    }),
    json: async () => (body ?? {}) as Record<string, unknown>,
    url: "http://localhost:3000/api/v1/tracks",
  } as unknown as NextRequest;
}

/* ------------------------------------------------------------------ */
/*  Setup / Teardown                                                 */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  process.env.JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));

  // Default: authenticated ARTIST with verified email and artist profile
  (getMockPrisma().user.findUnique as any).mockResolvedValue({
    emailVerified: true,
    roles: ["ARTIST"],
  });
  (getMockPrisma().artistProfile.findUnique as any).mockResolvedValue(mockArtistProfile);
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                          */
/* ------------------------------------------------------------------ */

function artistCookie(): string {
  const token = generateToken({
    sub: "user-123",
    role: "ARTIST",
    artistProfileId: "ap-001",
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/* ------------------------------------------------------------------ */
/*  Tests for STORY-track-005e                                       */
/* ------------------------------------------------------------------ */

describe("STORY-track-005e: Corrupted file upload flow", () => {
  const corruptedPayload = {
    title: "Corrupted Track Title",
    genre: "INDIE_ROCK",
    audioStorageKey: "audio/ap-001/track-1/corrupted.mp3",
    description: "A corrupted test track",
  };

  it("returns 422 when the uploaded audio file has a corrupted header", async () => {
    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "audio/ap-001/track-1/corrupted.mp3"),
    );

    const request = createMockRequest({
      body: corruptedPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);

    expect(response.status).toBe(422);

    const json = (await response.json()) as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("CORRUPTED_AUDIO_FILE");
    expect((json as any).error?.message).toBe(
      "Audio file is corrupted or unreadable.",
    );
    expect((json as any).meta?.timestamp).toBeDefined();
    expect((json as any).meta?.requestId).toBeDefined();
  });

  it("verifies error envelope contains correct structure for corrupted uploading", async () => {
    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "audio/ap-001/track-1/corrupted.mp3"),
    );

    const request = createMockRequest({
      body: corruptedPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);

    expect(response.status).toBe(422);

    const json = (await response.json()) as Record<string, unknown>;

    // success: false
    expect(json.success).toBe(false);

    // error object has code and message fields
    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe("CORRUPTED_AUDIO_FILE");
    expect(err.message).toBe("Audio file is corrupted or unreadable.");
    expect(err.details).toBeUndefined();

    // meta object exists with timestamp and requestId
    const meta = json.meta as Record<string, string>;
    expect(typeof meta.timestamp).toBe("string");
    expect(typeof meta.requestId).toBe("string");
  });

  it("calls storage cleanup (deleteObject) on the uploaded audio key for 422 response", async () => {
    // Get the deleteObject mock from the storage provider
    const storage = (createStorageProvider as ReturnType<typeof vi.fn>).mock.results[0].value;
    const deleteObjectMock = storage.deleteObject;

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "audio/ap-001/track-1/corrupted.mp3"),
    );

    const request = createMockRequest({
      body: corruptedPayload,
      cookie: artistCookie(),
    });
    await POST(request);

    // Cleanup should have called deleteObject on the audio storage key
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "audio/ap-001/track-1/corrupted.mp3",
    );
  });

  it("does NOT create any Track document when the audio file is corrupted", async () => {
    const callCountBefore = (getMockPrisma().track.create as ReturnType<typeof vi.fn>).mock.calls.length;

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "audio/ap-001/track-1/corrupted.mp3"),
    );

    const request = createMockRequest({
      body: corruptedPayload,
      cookie: artistCookie(),
    });
    await POST(request);

    // prisma.track.create should NOT have been called
    expect(
      (getMockPrisma().track.create as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(callCountBefore);
  });

  it("tolerates storage cleanup failures silently on the 422 code path", async () => {
    const storage = (createStorageProvider as ReturnType<typeof vi.fn>).mock.results[0].value;
    (storage.deleteObject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("S3 connection refused"),
    );

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "audio/ap-001/track-1/corrupted.mp3"),
    );

    const request = createMockRequest({
      body: corruptedPayload,
      cookie: artistCookie(),
    });

    // Should still return 422 even though cleanup failed
    const response = await POST(request);
    expect(response.status).toBe(422);

    const json = (await response.json()) as Record<string, unknown>;
    expect(json.error?.code).toBe("CORRUPTED_AUDIO_FILE");
  });

  it("returns 422 for corrupted audio when coverImageStorageKey is absent", async () => {
    const payloadWithoutCover = {
      title: "Corrupted Track No Cover",
      genre: "ELECTRONIC",
      audioStorageKey: "audio/ap-001/track-2/corrupted.wav",
    };

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "audio/ap-001/track-2/corrupted.wav"),
    );

    const request = createMockRequest({
      body: payloadWithoutCover,
      cookie: artistCookie(),
    });
    const response = await POST(request);

    expect(response.status).toBe(422);

    const json = (await response.json()) as Record<string, unknown>;
    expect(json.error?.code).toBe("CORRUPTED_AUDIO_FILE");
  });
});

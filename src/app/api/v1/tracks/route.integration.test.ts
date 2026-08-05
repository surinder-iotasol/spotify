/**
 * STORY-track-003: Integration test for POST /api/v1/tracks endpoint.
 *
 * Tests the full endpoint flow:
 * - 401 when no session cookie
 * - 403 when email not verified
 * - 403 when user is LISTENER (not ARTIST)
 * - 403 when no artist profile
 * - 422 when validation fails (empty title)
 * - 201 with full Track object on success
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { generateToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  hoisted mocks                                                     */
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
      findUnique: vi.fn(),
    },
    artistProfile: {
      findUnique: vi.fn(),
    },
    track: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage/storage-provider", () => ({
  createStorageProvider: vi.fn(() => ({
    readHeaderBytes: vi.fn().mockResolvedValue(Buffer.from("fffb904c", "hex")),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/services/audioMetadata", () => ({
  extractAudioMetadata: vi.fn().mockResolvedValue({
    duration: 245.67,
    durationMs: 245670,
    bitrate: 128000,
    sampleRate: 44100,
    channels: 2,
    codec: "mp3",
  }),
  CorruptedAudioError: class {} as unknown as typeof import("@/services/audioMetadata").CorruptedAudioError,
}));

/* ------------------------------------------------------------------ */
/*  imports — after mocks                                             */
/* ------------------------------------------------------------------ */

import { POST } from "./route";
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
/*  setup/teardown                                                    */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  process.env.JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";
  vi.resetAllMocks();

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
});

/* ------------------------------------------------------------------ */
/*  tests                                                             */
/* ------------------------------------------------------------------ */

const validTrackPayload = {
  title: "Midnight Echoes",
  genre: "INDIE_ROCK",
  audioStorageKey: "audio/ap-001/track-1/abc123.mp3",
  coverImageStorageKey: "covers/artist1/cover.jpg",
  description: "A haunting track",
};

function artistCookie(): string {
  const token = generateToken({
    sub: "user-123",
    role: "ARTIST",
    artistProfileId: "ap-001",
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("POST /api/v1/tracks — integration", () => {
  // 401 for unauthenticated
  it("returns 401 when no session cookie", async () => {
    const request = createMockRequest({ body: validTrackPayload });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 with empty cookie", async () => {
    const request = createMockRequest({
      body: validTrackPayload,
      cookie: "",
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  // 403 for non-ARTIST
  it("returns 403 when user is LISTENER", async () => {
    (getMockPrisma().user.findUnique as any).mockResolvedValue({
      emailVerified: true,
      roles: ["LISTENER"],
    });
    const token = generateToken({ sub: "user-123", role: "LISTENER" });
    const request = createMockRequest({
      body: validTrackPayload,
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("FORBIDDEN_ROLE");
  });

  // 403 for unverified email
  it("returns 403 when email not verified", async () => {
    (getMockPrisma().user.findUnique as any).mockResolvedValue({
      emailVerified: false,
      roles: ["ARTIST"],
    });
    const request = createMockRequest({
      body: validTrackPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("EMAIL_NOT_VERIFIED");
  });

  // 403 for no artist profile
  it("returns 403 when artist profile is missing", async () => {
    (getMockPrisma().artistProfile.findUnique as any).mockResolvedValue(null);
    const request = createMockRequest({
      body: validTrackPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  // 422 for validation errors
  it("returns 422 when title is empty", async () => {
    const invalidPayload = { ...validTrackPayload, title: "" };
    const request = createMockRequest({ body: invalidPayload, cookie: artistCookie() });
    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 when genre is invalid", async () => {
    const invalidPayload = { ...validTrackPayload, genre: "JAZZ" };
    const request = createMockRequest({ body: invalidPayload, cookie: artistCookie() });
    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns 422 when missing audioStorageKey", async () => {
    const invalidPayload = { title: "Midnight", genre: "INDIE_ROCK" };
    const request = createMockRequest({ body: invalidPayload, cookie: artistCookie() });
    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  // 201 success
  it("returns 201 with full Track object including UTC ISO-8601 timestamps", async () => {
    const mockCreatedTrack = {
      id: "t-created-456",
      title: "Midnight Echoes",
      genre: "INDIE_ROCK",
      description: "A haunting track",
      audioStorageKey: "audio/ap-001/track-1/abc123.mp3",
      audioUrl: null,
      coverImageUrl: "covers/artist1/cover.jpg",
      coverImageStorageKey: "covers/artist1/cover.jpg",
      artistProfileId: "ap-001",
      status: "LIVE",
      duration: 245.67,
      playCount: 0,
      likeCount: 0,
      isLive: true,
      isSoftHidden: false,
      deletedAt: null,
      createdAt: new Date("2025-06-01T00:00:00.000Z"),
      updatedAt: new Date("2025-06-01T00:00:00.000Z"),
    };
    (getMockPrisma().track.create as any).mockResolvedValue(mockCreatedTrack);

    const request = createMockRequest({
      body: validTrackPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.id).toBe("t-created-456");
    expect(data.title).toBe("Midnight Echoes");
    expect(data.genre).toBe("INDIE_ROCK");
    expect(data.coverImageUrl).toBe("covers/artist1/cover.jpg");
    expect(data.status).toBe("LIVE");
    expect(data.playCount).toBe(0);
    expect(data.isLive).toBe(true);

    // Verify timestamps are valid ISO-8601
    const createdAt = new Date(data.createdAt as string);
    expect(createdAt.toUTCString()).toBe(new Date("2025-06-01T00:00:00.000Z").toUTCString());
    const updatedAt = new Date(data.updatedAt as string);
    expect(updatedAt.toUTCString()).toBe(new Date("2025-06-01T00:00:00.000Z").toUTCString());
  });

  it("returns 201 with default cover URL when coverImageStorageKey is omitted", async () => {
    const mockCreatedTrack = {
      id: "t-created-789",
      title: "Midnight Echoes",
      genre: "AMBIENT",
      description: "Ambient sounds",
      audioStorageKey: "audio/ap-001/track-2/xyz789.mp3",
      audioUrl: null,
      coverImageUrl: "/static/covers/defaults/ambient.png",
      coverImageStorageKey: null,
      artistProfileId: "ap-001",
      status: "LIVE",
      duration: 180.0,
      playCount: 0,
      likeCount: 0,
      isLive: true,
      isSoftHidden: false,
      deletedAt: null,
      createdAt: new Date("2025-06-02T00:00:00.000Z"),
      updatedAt: new Date("2025-06-02T00:00:00.000Z"),
    };
    (getMockPrisma().track.create as any).mockResolvedValue(mockCreatedTrack);

    const payload = {
      title: "Midnight Echoes",
      genre: "AMBIENT",
      audioStorageKey: "audio/ap-001/track-2/xyz789.mp3",
    };
    const request = createMockRequest({ body: payload, cookie: artistCookie() });
    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = await response.json() as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect((data as any).coverImageUrl).toBe("/static/covers/defaults/ambient.png");
    expect((data as any).status).toBe("LIVE");
  });
});

/**
 * STORY-track-001: Integration test for POST /api/v1/tracks/upload-intent.
 *
 * Tests the full endpoint flow with valid and invalid payloads:
 * - 401 for unauthenticated requests
 * - 403 for non-ARTIST role
 * - 403 for unverified email
 * - 422 for invalid MIME types, oversized files
 * - 200 for successful upload-intent with presigned URLs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { generateToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Mocks (hoisted via vi.mock)                                       */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage/storage-provider", () => ({
  createStorageProvider: vi.fn(() => ({
    generatePresignedUploadUrl: vi.fn(async (key: string, _opts?: unknown) => {
      return `https://presigned-url.example.com/${key}?token=fake`;
    }),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Route import — after mocks are hoisted                              */
/* ------------------------------------------------------------------ */

import { POST } from "./route";
import prisma from "@/lib/prisma";

function getMockPrisma() {
  return prisma as unknown as {
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
}

/**
 * Create a mock NextRequest for the POST upload-intent endpoint.
 */
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
    url: "http://localhost:3000/api/v1/tracks/upload-intent",
  } as unknown as NextRequest;
}

/* ------------------------------------------------------------------ */
/*  Setup / Teardown                                                   */
/* ------------------------------------------------------------------ */

let originalJwtSecret: string | undefined;

beforeEach(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";
  vi.resetAllMocks();
  // Default: authenticated ARTIST user with verified email.
  getMockPrisma().user.findUnique.mockResolvedValue({
    emailVerified: true,
    roles: ["ARTIST"],
  });
});

afterEach(() => {
  if (originalJwtSecret !== undefined) {
    process.env.JWT_SECRET = originalJwtSecret;
  } else {
    delete process.env.JWT_SECRET;
  }
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/tracks/upload-intent — integration", () => {
  const validAudioPayload = {
    fileName: "song.mp3",
    fileSizeBytes: 10_000_000,
    mimeType: "audio/mpeg",
    trackId: "track-1",
    coverFileName: "cover.jpg",
    coverFileSizeBytes: 500_000,
    coverMimeType: "image/jpeg",
  };

  /** Generate a valid ARTIST token cookie. */
  function artistCookie(): string {
    const token = generateToken({
      sub: "user-123",
      role: "ARTIST",
      artistProfileId: "ap-001",
    });
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  /** Generate a LISTENER token cookie. */
  function listenerCookie(): string {
    const token = generateToken({
      sub: "user-123",
      role: "LISTENER",
    });
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  it("returns 401 when no session cookie is provided", async () => {
    const request = createMockRequest({ body: validAudioPayload });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when session cookie is empty", async () => {
    const request = createMockRequest({ cookie: "", body: validAudioPayload });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 when user has LISTENER role (not ARTIST)", async () => {
    (getMockPrisma().user.findUnique as any).mockResolvedValue({
      emailVerified: true,
      roles: ["LISTENER"],
    });
    const request = createMockRequest({
      body: validAudioPayload,
      cookie: listenerCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("FORBIDDEN_ROLE");
  });

  it("returns 403 when email is not verified", async () => {
    (getMockPrisma().user.findUnique as any).mockResolvedValue({
      emailVerified: false,
      roles: ["ARTIST"],
    });
    const request = createMockRequest({
      body: validAudioPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("returns 200 with presigned URLs for valid audio + cover payload", async () => {
    const request = createMockRequest({
      body: validAudioPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    const data = json.data as Record<string, unknown>;
    expect(data?.audioUploadUrl).toMatch(/^https:\/\/presigned-url\.example\.com\//);
    expect(data?.audioStorageKey).toContain("audio/");
    expect(data?.audioStorageKey).toContain("track-1");
    expect(data?.coverImageUploadUrl).toMatch(/^https:\/\/presigned-url\.example\.com\//);
    expect(data?.coverImageStorageKey).toContain("covers/");
    expect(data?.expiresAt).toBeDefined();
    // expiresAt must be valid ISO-8601 UTC
    expect(new Date(data.expiresAt as string).toISOString()).toBe(data.expiresAt);
  });

  it("returns 200 with audio-only (no cover) when cover fields omitted", async () => {
    const audioOnlyPayload = {
      fileName: "song.mp3",
      fileSizeBytes: 10_000_000,
      mimeType: "audio/mpeg",
      trackId: "track-2",
    };
    const request = createMockRequest({
      body: audioOnlyPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    const data = json.data as Record<string, unknown>;
    expect(data?.audioUploadUrl).toMatch(/^https:\/\/presigned-url\.example\.com\//);
    expect(data?.audioStorageKey).toContain("audio/");
    // cover image fields should be absent
    expect(data?.coverImageUploadUrl).toBeUndefined();
    expect(data?.coverImageStorageKey).toBeUndefined();
  });

  it("returns 422 when audio file exceeds 50 MB", async () => {
    const tooLargePayload = {
      ...validAudioPayload,
      fileSizeBytes: 60_000_000,
    };
    const request = createMockRequest({
      body: tooLargePayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when audio MIME type is not allowed", async () => {
    const badMimePayload = {
      ...validAudioPayload,
      mimeType: "audio/ogg",
    };
    const request = createMockRequest({
      body: badMimePayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when cover MIME type is not allowed", async () => {
    const badCoverPayload = {
      ...validAudioPayload,
      coverMimeType: "image/gif",
    };
    const request = createMockRequest({
      body: badCoverPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when cover file exceeds 5 MB", async () => {
    const tooLargeCoverPayload = {
      ...validAudioPayload,
      coverFileSizeBytes: 6_000_000,
    };
    const request = createMockRequest({
      body: tooLargeCoverPayload,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when required field trackId is missing", async () => {
    const missingTrackId = {
      fileName: "song.mp3",
      fileSizeBytes: 10_000_000,
      mimeType: "audio/mpeg",
    };
    const request = createMockRequest({
      body: missingTrackId,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
  });

  it("returns 400 when required field mimeType is missing", async () => {
    const missingMime = {
      fileName: "song.mp3",
      fileSizeBytes: 10_000_000,
      trackId: "track-3",
    };
    const request = createMockRequest({
      body: missingMime,
      cookie: artistCookie(),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
  });
});

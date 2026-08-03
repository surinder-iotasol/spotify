/**
 * STORY-profile-002: Integration test for PATCH /api/v1/artist-profile
 *
 * Tests the full endpoint flow with valid and invalid payloads:
 * - 401 for unauthenticated requests
 * - 403 for non-ARTIST role
 * - 422 for invalid display name, bio too long, invalid social links
 * - 200 for successful update
 * - 200 for partial updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { generateToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// ------------------------------------------------------------------ //
//  Mocks for service dependencies — hoisted via vi.mock               //
//  NOTE: vi.mock() is hoisted, so we use factory functions.            //
// ------------------------------------------------------------------ //

vi.mock("@/lib/prisma", () => ({
  default: {
    artistProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/logging", () => ({
  logRequestBody: vi.fn(async (req: NextRequest) => ({
    originalBody: await req.json(),
  })),
}));

// ------------------------------------------------------------------ //
//  Route imports — after mocks are hoisted                             //
// ------------------------------------------------------------------ //

import { PATCH } from "./route";
import prisma from "@/lib/prisma";

function getMockPrisma() {
  return prisma as unknown as {
    artistProfile: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

/**
 * Create a mock NextRequest for the PATCH endpoint.
 */
function createMockRequest({
  body,
  cookie,
}: {
  body?: unknown;
  cookie?: string;
}): NextRequest {
  return {
    method: "PATCH",
    headers: new Headers({
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    }),
    json: async () => (body ?? {}) as Record<string, unknown>,
    url: "http://localhost:3000/api/v1/artist-profile",
  } as unknown as NextRequest;
}

// ------------------------------------------------------------------ //
//  Setup & Teardown                                                   //
// ------------------------------------------------------------------ //

let originalJwtSecret: string | undefined;

beforeEach(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";
  vi.resetAllMocks();
});

afterEach(() => {
  if (originalJwtSecret !== undefined) {
    process.env.JWT_SECRET = originalJwtSecret;
  } else {
    delete process.env.JWT_SECRET;
  }
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------ //
//  Tests                                                              //
// ------------------------------------------------------------------ //

describe("PATCH /api/v1/artist-profile — integration", () => {
  it("returns 401 when no session cookie is present", async () => {
    const request = createMockRequest({ body: { displayName: "Test" } });
    const response = await PATCH(request);
    expect(response.status).toBe(401);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("USER_NOT_FOUND");
  });

  it("returns 401 when session cookie is empty", async () => {
    const request = createMockRequest({ cookie: "" });
    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 when user does not have ARTIST role", async () => {
    const token = generateToken({
      sub: "user-123",
      role: "LISTENER",
    });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const request = createMockRequest({ body: { displayName: "Test" }, cookie });

    const response = await PATCH(request);
    expect(response.status).toBe(403);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("FORBIDDEN_INSUFFICIENT_ROLE");
  });

  it("returns 422 when displayName exceeds 50 characters", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const request = createMockRequest({
      body: { displayName: "A".repeat(51) },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_DISPLAY_NAME");
    expect((json as any).error?.details).toBeDefined();
    expect(Array.isArray((json as any).error?.details)).toBe(true);
  });

  it("returns 422 when displayName is empty", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const request = createMockRequest({
      body: { displayName: "" },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_DISPLAY_NAME");
  });

  it("returns 422 when bio exceeds 500 characters", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const request = createMockRequest({
      body: { bio: "A".repeat(501) },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("BIO_TOO_LONG");
  });

  it("returns 422 when social links exceed 5 entries", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const request = createMockRequest({
      body: {
        socialLinks: Array(6).fill({ platform: "x", url: "https://x.com/a" }),
      },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_SOCIAL_LINKS");
  });

  it("returns 422 when social link URL is not HTTPS", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const request = createMockRequest({
      body: {
        socialLinks: [{ platform: "twitter", url: "http://twitter.com/artist" }],
      },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_SOCIAL_LINKS");
  });

  it("returns 200 for a valid patch request with displayName", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const mockProfile = {
      id: "ap-001",
      userId: "user-123",
      stageName: "OriginalName",
      bio: "Original bio",
      avatarUrl: "https://example.com/avatar.jpg",
      headerImageUrl: "https://example.com/header.jpg",
      socialLinks: null,
      isVerified: false,
      followerCount: 0,
    };

    const mp = getMockPrisma();
    mp.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mp.artistProfile.update.mockResolvedValue({
      ...mockProfile,
      stageName: "UpdatedName",
    });

    const request = createMockRequest({
      body: { displayName: "UpdatedName" },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect((json as any).data?.stageName).toBe("UpdatedName");
    expect(mp.artistProfile.update).toHaveBeenCalledWith({
      where: { id: "ap-001" },
      data: { stageName: "UpdatedName" },
    });
  });

  it("returns 200 for a valid patch with all fields", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const mockProfile = {
      id: "ap-001",
      userId: "user-123",
      stageName: "Artist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      followerCount: 0,
    };

    const updated = {
      ...mockProfile,
      stageName: "New Artist",
      bio: "New bio text",
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
    };

    const mp = getMockPrisma();
    mp.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mp.artistProfile.update.mockResolvedValue(updated);

    const request = createMockRequest({
      body: {
        displayName: "New Artist",
        bio: "New bio text",
        socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
      },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect((json as any).data?.stageName).toBe("New Artist");
    expect((json as any).data?.bio).toBe("New bio text");
  });

  it("returns 200 for a partial update (only bio)", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const mockProfile = {
      id: "ap-001",
      userId: "user-123",
      stageName: "Artist",
      bio: "Old bio",
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      followerCount: 0,
    };

    const mp = getMockPrisma();
    mp.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mp.artistProfile.update.mockResolvedValue({
      ...mockProfile,
      bio: "New bio",
    });

    const request = createMockRequest({
      body: { bio: "New bio" },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect((json as any).data?.stageName).toBe("Artist"); // unchanged
    expect((json as any).data?.bio).toBe("New bio"); // updated
  });

  it("returns 404 when user has no artist profile", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const mp = getMockPrisma();
    mp.artistProfile.findUnique.mockResolvedValue(null);

    const request = createMockRequest({
      body: { displayName: "Artist" },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(404);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("USER_NOT_FOUND");
  });

  it("returns correct error structure with details array on validation failure", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const request = createMockRequest({
      body: { displayName: "A".repeat(51) },
      cookie,
    });

    const response = await PATCH(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;

    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
    expect((json.error as any).code).toBe("INVALID_DISPLAY_NAME");
    expect((json.error as any).message).toBeDefined();
    expect(Array.isArray((json.error as any).details)).toBe(true);
    expect((json.error as any).details?.[0].path).toContain("displayName");
  });
});

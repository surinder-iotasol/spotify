/**
 * STORY-role-001: Integration test for POST /api/v1/users/me/upgrade-to-artist.
 *
 * Tests the route handler directly with a mocked Prisma client,
 * verifying:
 * - HTTP 200 with correct response envelope on success
 * - HTTP 401 when no session cookie is provided
 * - HTTP 422 when body validation fails (after auth check passes)
 * - HTTP 409 when user already has ARTIST role
 * - Set-Cookie header with fresh JWT
 * - Database state after successful upgrade (roles + ArtistProfile)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";

/* ------------------------------------------------------------------ */
/*  Test configuration                                                */
/* ------------------------------------------------------------------ */

const TEST_SECRET =
  "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

/* ------------------------------------------------------------------ */
/*  Mocked Prisma state                                               */
/* ------------------------------------------------------------------ */

const {
  mockUserFindUnique,
  mockUserUpdate,
  mockArtistProfileCreate,
  clearMocks,
  setupDefaults,
} = vi.hoisted(() => {
  const mockUserFindUnique = vi.fn();
  const mockUserUpdate = vi.fn();
  const mockArtistProfileCreate = vi.fn();

  function clearMocks() {
    vi.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserUpdate.mockReset();
    mockArtistProfileCreate.mockReset();
  }

  function setupDefaults() {
    mockUserFindUnique.mockResolvedValue({
      id: "user-test-001",
      displayName: "Test User",
      roles: ["LISTENER"],
    });
    mockUserUpdate.mockImplementation(async (args: {
      where: Record<string, unknown>;
      data: { roles: { set: string[] } };
    }) => ({
      id: args.where.id as string,
      email: "test@example.com",
      displayName: args.where.displayName as string,
      roles: args.data.roles.set,
      status: "ACTIVE",
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mockArtistProfileCreate.mockImplementation(async (args: {
      data: Record<string, unknown>;
    }) => ({
      id: "ap-test-001",
      userId: args.data.userId as string,
      stageName: args.data.stageName as string,
      bio: args.data.bio ?? null,
      genreTags: args.data.genreTags ?? null,
      followerCount: args.data.followerCount as number,
      trackCount: args.data.trackCount as number,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  return {
    mockUserFindUnique,
    mockUserUpdate,
    mockArtistProfileCreate,
    clearMocks,
    setupDefaults,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
    artistProfile: {
      create: mockArtistProfileCreate,
    },
    $transaction: vi.fn(async (fn) => {
      return fn({
        user: { update: mockUserUpdate },
        artistProfile: { create: mockArtistProfileCreate },
      });
    }),
  },
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
    artistProfile: {
      create: mockArtistProfileCreate,
    },
    $transaction: vi.fn(async (fn) => {
      return fn({
        user: { update: mockUserUpdate },
        artistProfile: { create: mockArtistProfileCreate },
      });
    }),
  },
}));

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  clearMocks();
  setupDefaults();
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate a valid session JWT for test cookies.
 */
function createSessionToken(userId: string, role: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sub: userId, role, artistProfileId: "ap-test-001", iat: now, exp: now + 604800 },
    TEST_SECRET,
    { algorithm: "HS256" },
  );
}

/**
 * Build a fetch-compatible request for the upgrade-to-artist route.
 */
async function callUpgradeRoute(
  body: unknown,
  userId?: string,
): Promise<Response> {
  const { POST } = await import(
    "@/app/api/v1/users/me/upgrade-to-artist/route"
  );

  const url = "http://localhost/api/v1/users/me/upgrade-to-artist";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (userId) {
    const token = createSessionToken(userId, "LISTENER");
    headers.cookie = `__Host-indie_session=${token}`;
  }

  const request = new Request(url, {
    method: "POST",
    headers,
    body: body !== null ? JSON.stringify(body) : null,
  });

  return (POST as any)(request as any);
}

/* ------------------------------------------------------------------ */
/*  Tests: Happy Path — HTTP 200                                       */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/users/me/upgrade-to-artist — success", () => {
  it("returns HTTP 200 with updated user and artistProfile", async () => {
    const response = await callUpgradeRoute(
      { stageName: "TestArtist", bio: "An artist bio", genreTags: ["indie", "rock"] },
      "user-test-001",
    );

    expect(response.status).toBe(200);

    const data = await response.json();

    // Verify response envelope
    expect(data.success).toBe(true);
    expect(data.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof data.meta.requestId).toBe("string");

    // Verify user data
    expect(data.data.user.roles).toContain("ARTIST");
    expect(data.data.user.roles).toContain("LISTENER");
    expect(data.data.user.displayName).toBe("Test User");

    // Verify artistProfile data
    expect(data.data.artistProfile.stageName).toBe("TestArtist");
    expect(data.data.artistProfile.bio).toBe("An artist bio");
    expect(data.data.artistProfile.genreTags).toEqual(["indie", "rock"]);
    expect(data.data.artistProfile.followerCount).toBe(0);
    expect(data.data.artistProfile.trackCount).toBe(0);
  });

  it("returns a Set-Cookie header with a fresh JWT", async () => {
    const response = await callUpgradeRoute({ stageName: "CookieTest" }, "user-test-001");

    expect(response.status).toBe(200);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();

    const tokenMatch = setCookie!.match(/^__Host-indie_session=([^;]+)/);
    expect(tokenMatch).toBeTruthy();
    const newToken = tokenMatch![1];

    // Verify JWT claims
    const decoded = jwt.verify(newToken, TEST_SECRET, { algorithms: ["HS256"] }) as any;
    expect(decoded.role).toBe("ARTIST");
    expect(decoded.sub).toBe("user-test-001");
    expect(decoded.artistProfileId).toBe("ap-test-001");
  });

  it("defaults stageName to displayName when omitted", async () => {
    const response = await callUpgradeRoute({}, "user-test-001");

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.data.artistProfile.stageName).toBe("Test User");
  });

  it("defaults bio and genreTags to null when omitted", async () => {
    const response = await callUpgradeRoute({}, "user-test-001");

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.data.artistProfile.bio).toBeNull();
    expect(data.data.artistProfile.genreTags).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Authentication — HTTP 401                                  */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/users/me/upgrade-to-artist — auth", () => {
  it("returns HTTP 401 when no session cookie is provided", async () => {
    const response = await callUpgradeRoute({ stageName: "Test" }, undefined);

    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns HTTP 401 with an empty cookie header", async () => {
    const { POST } = await import(
      "@/app/api/v1/users/me/upgrade-to-artist/route"
    );

    const request = new Request(
      "http://localhost/api/v1/users/me/upgrade-to-artist",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "",
        },
        body: JSON.stringify({ stageName: "Test" }),
      },
    );

    const response = await (POST as any)(request as any);
    expect(response.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Validation — HTTP 422                                      */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/users/me/upgrade-to-artist — validation", () => {
  it("returns HTTP 422 when stageName exceeds max length", async () => {
    const response = await callUpgradeRoute({ stageName: "a".repeat(81) }, "user-test-001");

    expect(response.status).toBe(422);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("VALIDATION_FAILED");
    expect(data.error.details).toBeDefined();
    expect(Array.isArray(data.error.details)).toBe(true);
    expect(data.error.details!.length).toBeGreaterThan(0);
  });

  it("returns HTTP 422 when bio exceeds max length", async () => {
    const response = await callUpgradeRoute({ bio: "a".repeat(1001) }, "user-test-001");

    expect(response.status).toBe(422);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns HTTP 422 when genreTags is not an array", async () => {
    const response = await callUpgradeRoute({ genreTags: "not-an-array" }, "user-test-001");

    expect(response.status).toBe(422);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Already Artist — HTTP 409                                   */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/users/me/upgrade-to-artist — already artist", () => {
  beforeEach(() => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: "user-already-artist",
      displayName: "Already Artist",
      roles: ["LISTENER", "ARTIST"],
    });
  });

  it("returns HTTP 409 when user already has ARTIST role", async () => {
    const response = await callUpgradeRoute({ stageName: "New Name" }, "user-already-artist");

    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("ALREADY_ARTIST");
    expect(data.error.message).toContain("already");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Database State Verification                                 */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/users/me/upgrade-to-artist — database state", () => {
  it("verifies roles were updated to include ARTIST", async () => {
    await callUpgradeRoute({ stageName: "DBTest" }, "user-test-001");

    // Verify user.update was called with correct roles
    const updateCall = mockUserUpdate.mock.calls[0];
    const roles = updateCall[0].data.roles.set;

    expect(roles).toContain("ARTIST");
    expect(roles).toContain("LISTENER");
    expect(roles.length).toBe(2);
  });

  it("verifies ArtistProfile was created with correct data", async () => {
    await callUpgradeRoute(
      { stageName: "DBTestArtist", bio: "Artist bio", genreTags: ["jazz", "blues"] },
      "user-test-001",
    );

    const createCall = mockArtistProfileCreate.mock.calls[0];
    const data = createCall[0].data;

    expect(data.userId).toBe("user-test-001");
    expect(data.stageName).toBe("DBTestArtist");
    expect(data.bio).toBe("Artist bio");
    expect(data.genreTags).toEqual(["jazz", "blues"]);
    expect(data.followerCount).toBe(0);
    expect(data.trackCount).toBe(0);
  });

  it("uses displayName as stageName when not provided", async () => {
    await callUpgradeRoute({}, "user-test-001");

    const createCall = mockArtistProfileCreate.mock.calls[0];
    const data = createCall[0].data;

    expect(data.stageName).toBe("Test User");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Timestamp Format                                           */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/users/me/upgrade-to-artist — timestamps", () => {
  it("returns timestamps in UTC ISO-8601 format", async () => {
    const response = await callUpgradeRoute({ stageName: "TimeTest" }, "user-test-001");

    expect(response.status).toBe(200);
    const data = await response.json();

    // Check user timestamps
    const userCreatedAt = data.data.user.createdAt;
    const userUpdatedAt = data.data.user.updatedAt;
    expect(new Date(userCreatedAt).toISOString()).toBe(userCreatedAt);
    expect(new Date(userUpdatedAt).toISOString()).toBe(userUpdatedAt);

    // Check artistProfile timestamps
    const profileCreatedAt = data.data.artistProfile.createdAt;
    const profileUpdatedAt = data.data.artistProfile.updatedAt;
    expect(new Date(profileCreatedAt).toISOString()).toBe(profileCreatedAt);
    expect(new Date(profileUpdatedAt).toISOString()).toBe(profileUpdatedAt);

    // Check response meta timestamp
    const metaTimestamp = data.meta.timestamp;
    expect(new Date(metaTimestamp).toISOString()).toBe(metaTimestamp);
  });
});

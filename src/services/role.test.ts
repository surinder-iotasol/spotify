/**
 * STORY-role-001: Unit tests for the listener-to-artist upgrade service.
 *
 * Covers:
 *  - Atomic role update (appending ARTIST to User.roles while preserving LISTENER)
 *  - Default stageName fallback to User.displayName
 *  - ALREADY_ARTIST error when user already has ARTIST role
 *  - Transaction error handling (internal error path)
 *  - Fresh JWT with revised role claims (ARTIST)
 *  - Correct response payload (user + artistProfile)
 *  - Timestamps in UTC ISO-8601 format
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { upgradeToArtist, upgradeToArtistSchema, UPGRADE_ERRORS } from "./role";
import type { UpgradeInput } from "./role";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const TEST_JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";

/**
 * Set up a minimal Prisma mock that tracks transaction calls and their arguments.
 */
function createMockPrisma() {
  const transactions: Array<{
    fn: (tx: any) => Promise<{ user: unknown; artistProfile: unknown }>;
    options?: { timeout?: number; maxWait?: number };
  }> = [];

  const mockTx = {
    user: {
      update: vi.fn(async ({ where, data }) => ({
        id: where.id,
        email: "test@example.com",
        displayName: where.displayName,
        roles: data.roles.set,
        status: "ACTIVE",
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    },
    artistProfile: {
      create: vi.fn(async ({ data }) => {
        return {
          id: "ap-test-001",
          userId: data.userId,
          stageName: data.stageName,
          bio: data.bio ?? null,
          genreTags: data.genreTags ?? null,
          followerCount: data.followerCount,
          trackCount: data.trackCount,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
    },
  };

  const mockPrisma = {
    $transaction: vi.fn(async (fn, options) => {
      transactions.push({ fn, options });
      return fn(mockTx);
    }),
  };

  return { mockPrisma, mockTx, transactions };
}

/* ------------------------------------------------------------------ */
/*  Setup & Teardown: control JWT_SECRET for the auth module          */
/* ------------------------------------------------------------------ */

let originalJwtSecret: string | undefined;

beforeEach(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
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
/*  Tests: Atomic Role Update                                         */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — atomic role update", () => {
  it("appends ARTIST to existing roles while preserving LISTENER", async () => {
    const { mockPrisma, mockTx } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-123",
      ["LISTENER"],
      "Jane Doe",
      { stageName: "JazzyJane" },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);

    // Verify the roles were updated to include ARTIST
    const updateCall = mockTx.user.update.mock.calls[0][0];
    expect(updateCall.data.roles.set).toEqual(["LISTENER", "ARTIST"]);

    // Verify the response contains the updated roles
    expect((result.user as any)?.roles).toEqual(["LISTENER", "ARTIST"]);
  });

  it("preserves multiple existing roles", async () => {
    const { mockPrisma, mockTx } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-456",
      ["LISTENER", "ADMIN"],
      "Admin User",
      {},
    );

    expect(result.success).toBe(true);

    const updateCall = mockTx.user.update.mock.calls[0][0];
    expect(updateCall.data.roles.set).toEqual(["LISTENER", "ADMIN", "ARTIST"]);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Default stageName Fallback                                 */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — default stageName fallback", () => {
  it("defaults stageName to User.displayName when stageName is omitted", async () => {
    const { mockPrisma, mockTx } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-789",
      ["LISTENER"],
      "Jane Doe",
      {} as UpgradeInput, // no stageName
    );

    expect(result.success).toBe(true);

    // Verify ArtistProfile was created with displayName as stageName
    const createCall = mockTx.artistProfile.create.mock.calls[0][0];
    expect(createCall.data.stageName).toBe("Jane Doe");

    // Verify response
    expect((result.artistProfile as any)?.stageName).toBe("Jane Doe");
  });

  it("uses provided stageName when given", async () => {
    const { mockPrisma, mockTx } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-789",
      ["LISTENER"],
      "Jane Doe",
      { stageName: "JazzyJane" },
    );

    expect(result.success).toBe(true);

    const createCall = mockTx.artistProfile.create.mock.calls[0][0];
    expect(createCall.data.stageName).toBe("JazzyJane");
    expect((result.artistProfile as any)?.stageName).toBe("JazzyJane");
  });

  it("trims whitespace from stageName", async () => {
    const { mockPrisma, mockTx } = createMockPrisma();

    // Zod schema transforms: .transform((v) => v.trim())
    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-789",
      ["LISTENER"],
      "Jane Doe",
      { stageName: "  JazzyJane  " },
    );

    expect(result.success).toBe(true);

    const createCall = mockTx.artistProfile.create.mock.calls[0][0];
    expect(createCall.data.stageName).toBe("JazzyJane");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: ALREADY_ARTIST Error Path                                  */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — ALREADY_ARTIST error", () => {
  it("returns 409 when user already has ARTIST role", async () => {
    const { mockPrisma } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-already-artist",
      ["LISTENER", "ARTIST"],
      "Already Artist",
      { stageName: "New Name" },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe(UPGRADE_ERRORS.ALREADY_ARTIST);
    expect(result.message).toBe("User already has the ARTIST role.");
    expect(result.user).toBeNull();
    expect(result.artistProfile).toBeNull();
    expect(result.cookie).toBeNull();

    // Verify no transaction was executed
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Transaction Error Handling                                 */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — error handling", () => {
  it("returns 500 on database transaction failure", async () => {
    const { mockPrisma } = createMockPrisma();

    // Override the transaction to throw
    (mockPrisma.$transaction as any).mockRejectedValueOnce(new Error("DB connection failed"));

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-error",
      ["LISTENER"],
      "Error User",
      { stageName: "Test" },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe(UPGRADE_ERRORS.INTERNAL_ERROR);
    expect(result.user).toBeNull();
    expect(result.artistProfile).toBeNull();
  });

  it("returns 409 on unique constraint violation (duplicate profile)", async () => {
    const { mockPrisma } = createMockPrisma();

    // Simulate a unique constraint error from the database
    const uniqueError = new Error("Unique constraint failed on the fields: (`user_id`)");
    (mockPrisma.$transaction as any).mockRejectedValueOnce(uniqueError);

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-duplicate",
      ["LISTENER"],
      "Dup User",
      { stageName: "Test" },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe(UPGRADE_ERRORS.ALREADY_ARTIST);
    expect(result.message).toBe("An artist profile already exists for this user.");
  });

  it("returns 500 on non-unique database errors", async () => {
    const { mockPrisma } = createMockPrisma();

    // Simulate a different database error (not a unique constraint)
    const dbError = new Error("Column 'stageName' cannot be null");
    (mockPrisma.$transaction as any).mockRejectedValueOnce(dbError);

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-nul",
      ["LISTENER"],
      "Null User",
      { stageName: "" },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe(UPGRADE_ERRORS.INTERNAL_ERROR);
  });

  it("handles non-Error exceptions gracefully", async () => {
    const { mockPrisma } = createMockPrisma();

    (mockPrisma.$transaction as any).mockRejectedValueOnce("string error");

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-string-err",
      ["LISTENER"],
      "String Error User",
      { stageName: "Test" },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe(UPGRADE_ERRORS.INTERNAL_ERROR);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: JWT Claims                                                 */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — JWT claims", () => {
  it("generates a fresh JWT with ARTIST role", async () => {
    const { mockPrisma } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-jwt",
      ["LISTENER"],
      "JWT User",
      { stageName: "JazzyJane" },
    );

    expect(result.success).toBe(true);
    expect(result.cookie).toBeDefined();
    expect(result.cookie).toContain("HttpOnly");
    expect(result.cookie).toContain("Secure");
    expect(result.cookie).toContain("SameSite=Strict");

    // The cookie should set a valid JWT token
    const tokenMatch = result.cookie!.match(/^__Host-indie_session=([^;]+)/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];

    // Verify the JWT can be decoded and has ARTIST role
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(token, TEST_JWT_SECRET, {
      algorithms: ["HS256"],
    }) as any;

    expect(decoded.role).toBe("ARTIST");
    expect(decoded.sub).toBe("user-jwt");
    expect(decoded.artistProfileId).toBe("ap-test-001");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Response Payload Structure                                  */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — response payload", () => {
  it("returns user and artistProfile in the response", async () => {
    const { mockPrisma } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-payload",
      ["LISTENER"],
      "Payload User",
      { stageName: "PayloadJane", bio: "Singer-songwriter", genreTags: ["indie", "pop"] },
    );

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.artistProfile).toBeDefined();

    const user = result.user as Record<string, unknown>;
    expect(user.id).toBe("user-payload");
    expect(user.displayName).toBe("Payload User");
    expect(user.email).toBe("test@example.com");
    expect(user.roles).toEqual(["LISTENER", "ARTIST"]);
    expect(user.status).toBe("ACTIVE");

    // Timestamps should be ISO-8601
    const createdAtStr = String(user.createdAt);
    const updatedAtStr = String(user.updatedAt);
    expect(new Date(createdAtStr).toISOString()).toBe(createdAtStr);
    expect(new Date(updatedAtStr).toISOString()).toBe(updatedAtStr);
  });

  it("returns artistProfile with correct fields", async () => {
    const { mockPrisma } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-ap",
      ["LISTENER"],
      "AP User",
      { stageName: "APJane", bio: "Rock artist", genreTags: ["rock", "indie"] },
    );

    const profile = result.artistProfile as Record<string, unknown>;
    expect(profile.id).toBe("ap-test-001");
    expect(profile.userId).toBe("user-ap");
    expect(profile.stageName).toBe("APJane");
    expect(profile.bio).toBe("Rock artist");
    expect(profile.followerCount).toBe(0);
    expect(profile.trackCount).toBe(0);

    // Verify timestamps are ISO-8601
    const createdAtStr = String(profile.createdAt);
    expect(new Date(createdAtStr).toISOString()).toBe(createdAtStr);
  });

  it("sets bio to null when omitted", async () => {
    const { mockPrisma } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-bio-null",
      ["LISTENER"],
      "Bio Null User",
      {} as UpgradeInput,
    );

    const profile = result.artistProfile as Record<string, unknown>;
    expect(profile.bio).toBeNull();
  });

  it("sets genreTags to null when omitted", async () => {
    const { mockPrisma } = createMockPrisma();

    const result = await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-tags-null",
      ["LISTENER"],
      "Tags Null User",
      {} as UpgradeInput,
    );

    const profile = result.artistProfile as Record<string, unknown>;
    expect(profile.genreTags).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Zod Schema Validation                                      */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — validation schema", () => {
  it("rejects stageName longer than 80 characters", () => {
    const tooLong = "a".repeat(81);
    const result = upgradeToArtistSchema.safeParse({
      stageName: tooLong,
    });
    expect(result.success).toBe(false);
  });

  it("accepts stageName of exactly 80 characters", () => {
    const exactly80 = "a".repeat(80);
    const result = upgradeToArtistSchema.safeParse({
      stageName: exactly80,
    });
    expect(result.success).toBe(true);
  });

  it("rejects bio longer than 1000 characters", () => {
    const tooLong = "a".repeat(1001);
    const result = upgradeToArtistSchema.safeParse({
      bio: tooLong,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty genreTags array", () => {
    const result = upgradeToArtistSchema.safeParse({
      genreTags: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-array genreTags", () => {
    const result = upgradeToArtistSchema.safeParse({
      genreTags: "not-an-array",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a completely empty object (all fields optional)", () => {
    const result = upgradeToArtistSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Transaction Timeout                                        */
/* ------------------------------------------------------------------ */

describe("upgradeToArtist — transaction options", () => {
  it("sets a 10-second timeout on the transaction", async () => {
    const { mockPrisma } = createMockPrisma();

    await upgradeToArtist(
      mockPrisma as unknown as any,
      "user-timeout",
      ["LISTENER"],
      "Timeout User",
      { stageName: "Test" },
    );

    const transactionCall = mockPrisma.$transaction.mock.calls[0];
    const options = transactionCall[1];

    expect(options).toBeDefined();
    expect(options?.timeout).toBe(10_000);
  });
});

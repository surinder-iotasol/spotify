/**
 * STORY-role-003: Unit tests for email verification token confirmation.
 *
 * Covers:
 * - Valid token processing (hash match, unexpired, updates emailVerified)
 * - Expired token rejection (HTTP 400 INVALID_VERIFICATION_TOKEN)
 * - Invalid digest matching (HTTP 400 INVALID_VERIFICATION_TOKEN)
 * - No active token record (HTTP 400 INVALID_VERIFICATION_TOKEN)
 * - Empty token rejection
 * - getVerificationStatus returns correct data
 * - getVerificationStatus returns empty for unknown user
 */

import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";
import { createHash } from "crypto";
import type { PrismaClient, VerificationToken, User } from "@prisma/client";
import { verifyEmailToken, getVerificationStatus } from "./emailVerificationConfirm";

// ------------------------------------------------------------------ //
//  Mock helpers                                                        //
// ------------------------------------------------------------------ //

function makeMockUser(overrides?: Partial<User>): Partial<User> {
  return {
    id: "user-1",
    email: "test@example.com",
    passwordHash: "$2b$12$...",
    displayName: "Test User",
    roles: ["LISTENER", "ARTIST"] as never[],
    status: "ACTIVE" as never,
    emailVerified: false,
    emailVerifiedAt: null,
    tokenInvalidatedBefore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockToken(overrides?: Partial<VerificationToken>): Partial<VerificationToken> {
  const now = new Date();
  return {
    id: "token-1",
    userId: "user-1",
    tokenHash: createHash("sha256").update("test-token").digest("hex"),
    expiresAt: new Date(now.getTime() + 86400 * 1000), // 24h from now
    invalid: false,
    createdAt: now,
    ...overrides,
  };
}

// Build a mock PrismaClient that mirrors the shape of the real client
function createMockPrisma(): Mocked<PrismaClient> {
  return {
    verificationToken: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  } as unknown as Mocked<PrismaClient>;
}

// ------------------------------------------------------------------ //
//  verifyEmailToken tests                                              //
// ------------------------------------------------------------------ //

describe("verifyEmailToken", () => {
  describe("happy path — valid, unexpired token", () => {
    it("updates emailVerified to true, sets emailVerifiedAt, deletes token", async () => {
      const mockPrisma = createMockPrisma();
      const token = makeMockToken();
      const user = makeMockUser({ emailVerified: false });

      const updatedUser = {
        id: "user-1",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      };

      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...token,
        user: user as User,
      } as never);

      (mockPrisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser as never);

      (mockPrisma.verificationToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const result = await verifyEmailToken(mockPrisma as unknown as PrismaClient, "test-token");

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.userId).toBe("user-1");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailVerified: true,
            emailVerifiedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "token-1" },
      });
    });
  });

  describe("invalid token — hash does not match", () => {
    it("returns 400 INVALID_VERIFICATION_TOKEN when no token record matches", async () => {
      const mockPrisma = createMockPrisma();

      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await verifyEmailToken(mockPrisma as unknown as PrismaClient, "wrong-token");

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_VERIFICATION_TOKEN");
      expect(result.message).toBe("Verification token is invalid or has expired.");
    });
  });

  describe("expired token", () => {
    it("returns 400 INVALID_VERIFICATION_TOKEN when token has expired", async () => {
      const mockPrisma = createMockPrisma();

      // The DB query uses expiresAt: { gt: new Date() }, so an expired token
      // will NOT be returned by findFirst.  We mock accordingly.
      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await verifyEmailToken(mockPrisma as unknown as PrismaClient, "expired-token");

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_VERIFICATION_TOKEN");
    });
  });

  describe("empty or missing token", () => {
    it("returns 400 INVALID_VERIFICATION_TOKEN for empty string", async () => {
      const mockPrisma = createMockPrisma();

      const result = await verifyEmailToken(mockPrisma as unknown as PrismaClient, "");

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_VERIFICATION_TOKEN");
    });

    it("returns 400 INVALID_VERIFICATION_TOKEN for null/undefined (coerced)", async () => {
      const mockPrisma = createMockPrisma();

      // TypeScript won't allow null here, but we handle it defensively
      const result = await verifyEmailToken(
        mockPrisma as unknown as PrismaClient,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        null as unknown as string,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });
  });

  describe("server error", () => {
    it("returns 500 INTERNAL_ERROR when database throws", async () => {
      const mockPrisma = createMockPrisma();

      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Database connection failed"),
      );

      const result = await verifyEmailToken(mockPrisma as unknown as PrismaClient, "test-token");

      expect(result.success).toBe(false);
      expect(result.status).toBe(500);
      expect(result.code).toBe("INTERNAL_ERROR");
    });
  });
});

// ------------------------------------------------------------------ //
//  getVerificationStatus tests                                         //
// ------------------------------------------------------------------ //

describe("getVerificationStatus", () => {
  it("returns emailVerified=false, canUpload=false, roles=[ARTIST] for unverified artist", async () => {
    const mockPrisma = createMockPrisma();
    const user = makeMockUser({ emailVerified: false, roles: ["ARTIST"] as never[] });

    (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailVerified: false,
      roles: ["ARTIST"],
    } as never);

    const result = await getVerificationStatus(mockPrisma as unknown as PrismaClient, "user-1");

    expect(result.emailVerified).toBe(false);
    expect(result.canUpload).toBe(false);
    expect(result.roles).toEqual(["ARTIST"]);
  });

  it("returns emailVerified=true, canUpload=true for verified artist", async () => {
    const mockPrisma = createMockPrisma();

    (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailVerified: true,
      roles: ["ARTIST", "LISTENER"],
    } as never);

    const result = await getVerificationStatus(mockPrisma as unknown as PrismaClient, "user-1");

    expect(result.emailVerified).toBe(true);
    expect(result.canUpload).toBe(true);
    expect(result.roles).toEqual(["ARTIST", "LISTENER"]);
  });

  it("returns emailVerified=false, canUpload=false for unknown user", async () => {
    const mockPrisma = createMockPrisma();

    (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getVerificationStatus(mockPrisma as unknown as PrismaClient, "unknown-user");

    expect(result.emailVerified).toBe(false);
    expect(result.canUpload).toBe(false);
    expect(result.roles).toEqual([]);
  });

  it("returns canUpload=false for verified listener (no ARTIST/ADMIN role)", async () => {
    const mockPrisma = createMockPrisma();

    (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailVerified: true,
      roles: ["LISTENER"],
    } as never);

    const result = await getVerificationStatus(mockPrisma as unknown as PrismaClient, "user-1");

    expect(result.emailVerified).toBe(true);
    expect(result.canUpload).toBe(false);
  });

  it("handles server errors gracefully", async () => {
    const mockPrisma = createMockPrisma();

    (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Database error"),
    );

    const result = await getVerificationStatus(mockPrisma as unknown as PrismaClient, "user-1");

    expect(result.emailVerified).toBe(false);
    expect(result.canUpload).toBe(false);
    expect(result.roles).toEqual([]);
  });
});

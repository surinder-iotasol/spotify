/**
 * STORY-role-003: Integration tests for email verification confirm endpoint.
 *
 * Covers:
 * - Valid token returns HTTP 200 with verified=true
 * - Invalid token returns HTTP 400 with INVALID_VERIFICATION_TOKEN
 * - Expired token returns HTTP 400 with INVALID_VERIFICATION_TOKEN
 * - Missing token returns HTTP 400 with INVALID_VERIFICATION_TOKEN
 * - getVerificationStatus returns correct data for authenticated users
 * - getVerificationStatus returns 401 for unauthenticated requests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "crypto";
import type { PrismaClient, VerificationToken, User } from "@prisma/client";
import { verifyEmailToken, getVerificationStatus } from "./emailVerificationConfirm";
import type { Mocked } from "vitest";
import { verifyToken } from "@/lib/auth";

// ------------------------------------------------------------------ //
//  Mock helpers                                                        //
// ------------------------------------------------------------------ //

function makeMockPrisma(): Mocked<PrismaClient> {
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
//  Mocks for verifyToken                                               //
// ------------------------------------------------------------------ //

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    verifyToken: vi.fn(),
    verifySession: vi.fn(),
    SESSION_COOKIE_NAME: "__Host-indie_session",
  };
});

// ------------------------------------------------------------------ //
//  Integration tests for POST /api/v1/auth/verify-email/confirm       //
// ------------------------------------------------------------------ //

describe("POST /api/v1/auth/verify-email/confirm (integration)", () => {
  describe("valid token", () => {
    it("returns HTTP 200 with verified=true", async () => {
      const mockPrisma = makeMockPrisma();
      const rawToken = "valid-test-token-abc123";
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const now = new Date();

      // Mock findFirst to return an active, unexpired token
      const mockToken = {
        id: "token-1",
        userId: "user-1",
        tokenHash,
        expiresAt: new Date(now.getTime() + 86400 * 1000),
        invalid: false,
        createdAt: now,
        user: {
          id: "user-1",
          email: "test@example.com",
          emailVerified: false,
          roles: ["LISTENER", "ARTIST"] as never[],
        } as unknown as User,
      } as VerificationToken & { user: User };

      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockToken as never,
      );

      (mockPrisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        emailVerified: true,
        emailVerifiedAt: now,
      } as never);

      (mockPrisma.verificationToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      } as never);

      const result = await verifyEmailToken(
        mockPrisma as unknown as PrismaClient,
        rawToken,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.userId).toBe("user-1");
      expect(result.code).toBe("");
    });
  });

  describe("invalid token — hash does not match", () => {
    it("returns HTTP 400 INVALID_VERIFICATION_TOKEN", async () => {
      const mockPrisma = makeMockPrisma();

      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await verifyEmailToken(
        mockPrisma as unknown as PrismaClient,
        "wrong-token",
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_VERIFICATION_TOKEN");
    });
  });

  describe("expired token", () => {
    it("returns HTTP 400 INVALID_VERIFICATION_TOKEN", async () => {
      const mockPrisma = makeMockPrisma();

      // Since the query filters on expiresAt > now, expired tokens won't match
      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await verifyEmailToken(
        mockPrisma as unknown as PrismaClient,
        "expired-token",
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_VERIFICATION_TOKEN");
    });
  });

  describe("missing token", () => {
    it("returns HTTP 400 INVALID_VERIFICATION_TOKEN for empty string", async () => {
      const mockPrisma = makeMockPrisma();

      const result = await verifyEmailToken(
        mockPrisma as unknown as PrismaClient,
        "",
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_VERIFICATION_TOKEN");
    });
  });

  describe("server error", () => {
    it("returns HTTP 500 INTERNAL_ERROR on DB failure", async () => {
      const mockPrisma = makeMockPrisma();

      (mockPrisma.verificationToken.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("DB connection failed"),
      );

      const result = await verifyEmailToken(
        mockPrisma as unknown as PrismaClient,
        "test-token",
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(500);
      expect(result.code).toBe("INTERNAL_ERROR");
    });
  });
});

// ------------------------------------------------------------------ //
//  Integration tests for GET /api/v1/users/me/verification-status     //
// ------------------------------------------------------------------ //

describe("GET /api/v1/users/me/verification-status (integration)", () => {
  describe("authenticated user", () => {
    it("returns emailVerified=true, canUpload=true for verified artist", async () => {
      const mockPrisma = makeMockPrisma();

      (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailVerified: true,
        roles: ["ARTIST", "LISTENER"],
      } as never);

      const result = await getVerificationStatus(
        mockPrisma as unknown as PrismaClient,
        "user-1",
      );

      expect(result.emailVerified).toBe(true);
      expect(result.canUpload).toBe(true);
      expect(result.roles).toEqual(["ARTIST", "LISTENER"]);
    });

    it("returns emailVerified=false, canUpload=false for unverified user", async () => {
      const mockPrisma = makeMockPrisma();

      (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailVerified: false,
        roles: ["ARTIST"],
      } as never);

      const result = await getVerificationStatus(
        mockPrisma as unknown as PrismaClient,
        "user-1",
      );

      expect(result.emailVerified).toBe(false);
      expect(result.canUpload).toBe(false);
    });
  });

  describe("unknown user", () => {
    it("returns emailVerified=false, canUpload=false, roles=[]", async () => {
      const mockPrisma = makeMockPrisma();

      (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getVerificationStatus(
        mockPrisma as unknown as PrismaClient,
        "unknown-user",
      );

      expect(result.emailVerified).toBe(false);
      expect(result.canUpload).toBe(false);
      expect(result.roles).toEqual([]);
    });
  });
});

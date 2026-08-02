/**
 * STORY-role-002: Unit tests for the email verification service.
 *
 * Acceptance criteria covered:
 * 1. Token generation produces 64-character hex strings.
 * 2. SHA-256 hashing produces correct digests.
 * 3. Prior token invalidation works correctly.
 * 4. generateVerificationToken returns HTTP 202 with expiresInSeconds=86400.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomBytes, createHash } from "crypto";
import {
  generateToken,
  hashToken,
  generateVerificationToken,
  type VerificationTokenResult,
} from "@/services/emailVerification";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Create a mock PrismaClient that tracks calls to user.findUnique,
 * verificationToken.updateMany, and verificationToken.create.
 */
function createMockPrisma() {
  const calls = {
    findUnique: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: "vt-1" }),
  };

  return {
    user: {
      findUnique: calls.findUnique,
    },
    verificationToken: {
      updateMany: calls.updateMany,
      create: calls.create,
    },
    _calls: calls,
  };
}

/* ------------------------------------------------------------------ */
/*  AC1 — Token generation (64-char hex)                               */
/* ------------------------------------------------------------------ */

describe("generateToken", () => {
  it("produces a 64-character hex string", () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces unique tokens on each call", () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
  });
});

/* ------------------------------------------------------------------ */
/*  AC2 — SHA-256 hashing                                              */
/* ------------------------------------------------------------------ */

describe("hashToken", () => {
  it("produces a 64-character hex digest", () => {
    const token = generateToken();
    const digest = hashToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces deterministic output for the same input", () => {
    const token = "test-token-12345";
    const digest1 = hashToken(token);
    const digest2 = hashToken(token);
    expect(digest1).toBe(digest2);
  });

  it("produces different digests for different inputs", () => {
    const digest1 = hashToken("token-a");
    const digest2 = hashToken("token-b");
    expect(digest1).not.toBe(digest2);
  });

  it("matches Node crypto.createHash('sha256') output", () => {
    const token = generateToken();
    const ourHash = hashToken(token);
    const expectedHash = createHash("sha256").update(token).digest("hex");
    expect(ourHash).toBe(expectedHash);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3 — Prior token invalidation                                     */
/* ------------------------------------------------------------------ */

describe("generateVerificationToken — prior token invalidation", () => {
  it("calls updateMany to invalidate existing active tokens for the user", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-1", email: "user@example.com" });

    const result = await generateVerificationToken(
      mock as any,
      "user-1",
      {},
      "user@example.com",
    );

    expect(result.success).toBe(true);
    expect(mock._calls.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", invalid: false },
      data: { invalid: true },
    });
  });

  it("calls updateMany even when no prior tokens exist (idempotent)", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-2", email: "user2@example.com" });

    await generateVerificationToken(
      mock as any,
      "user-2",
      {},
      "user2@example.com",
    );

    // updateMany should still be called — it's safe to invalidate zero records
    expect(mock._calls.updateMany).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  AC4 — HTTP 202 response with expiresInSeconds                      */
/* ------------------------------------------------------------------ */

describe("generateVerificationToken — success response", () => {
  it("returns HTTP 202 with expiresInSeconds=86400 by default", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-3", email: "user3@example.com" });

    const result = await generateVerificationToken(
      mock as any,
      "user-3",
      {},
      "user3@example.com",
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(202);
    expect(result.expiresInSeconds).toBe(86400);
    expect(result.message).toBe("Verification email sent.");
    expect(result.tokenHash).toHaveLength(64);
    expect(result.expiresAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.verificationUrl).toContain("/verify-email?token=");
  });

  it("uses custom expirationSeconds when provided", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-4", email: "user4@example.com" });

    const result = await generateVerificationToken(
      mock as any,
      "user-4",
      { expirationSeconds: 3600 },
      "user4@example.com",
    );

    expect(result.success).toBe(true);
    expect(result.expiresInSeconds).toBe(3600);
  });

  it("uses custom verificationBaseUrl when provided", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-5", email: "user5@example.com" });

    const result = await generateVerificationToken(
      mock as any,
      "user-5",
      { verificationBaseUrl: "https://myapp.com" },
      "user5@example.com",
    );

    expect(result.success).toBe(true);
    expect(result.verificationUrl).toContain("https://myapp.com/verify-email?token=");
  });

  it("returns tokenHash that matches SHA-256 of the generated token", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-6", email: "user6@example.com" });

    const result = await generateVerificationToken(
      mock as any,
      "user-6",
      {},
      "user6@example.com",
    );

    expect(result.success).toBe(true);
    // The rawToken is returned in the result; verify its hash matches tokenHash
    if (result.rawToken) {
      const expectedHash = hashToken(result.rawToken);
      expect(result.tokenHash).toBe(expectedHash);
    }
  });

  it("returns USER_NOT_FOUND for non-existent user", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue(null);

    const result = await generateVerificationToken(
      mock as any,
      "nonexistent-user",
      {},
      "",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.code).toBe("USER_NOT_FOUND");
    expect(result.tokenHash).toBe("");
  });

  it("returns 500 on internal error", async () => {
    const mock = createMockPrisma();
    mock._calls.findUnique.mockResolvedValue({ id: "user-7", email: "user7@example.com" });
    // Make create throw to trigger the catch block
    mock._calls.create.mockRejectedValue(new Error("DB connection failed"));

    const result = await generateVerificationToken(
      mock as any,
      "user-7",
      {},
      "user7@example.com",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe("INTERNAL_ERROR");
  });
});

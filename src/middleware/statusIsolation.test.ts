/**
 * STORY-profile-005: Unit tests for the account status isolation filter.
 *
 * Covers:
 *  - isAccountSuspended returns true for SUSPENDED and BANNED users
 *  - isAccountSuspended returns false for ACTIVE users
 *  - getSuspendedUserError returns correct 404 error envelope
 *  - isAccountSuspended returns false when user is not found (delegated to caller)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isAccountSuspended,
  getSuspendedUserError,
  type SuspendedUserError,
  SUSPENDED_USER_ERROR_CODES,
} from "./statusIsolation";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const TEST_JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";

/**
 * Create a minimal prisma-like mock that can return a user record.
 */
function createMockPrismaWithUser(user?: Record<string, unknown>) {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (!user) return null;
        return { ...user, id: where.id };
      }),
    },
  } as unknown as {
    user: {
      findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
  };
}

/* ------------------------------------------------------------------ */
/*  Setup & Teardown                                                  */
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
/*  Tests: isAccountSuspended                                         */
/* ------------------------------------------------------------------ */

describe("isAccountSuspended", () => {
  it("returns true when user status is SUSPENDED", async () => {
    const mockPrisma = createMockPrismaWithUser({
      id: "user-1",
      status: "SUSPENDED" as any,
      email: "suspended@example.com",
      displayName: "Suspended User",
    });

    const result = await isAccountSuspended(mockPrisma, "user-1");
    expect(result).toBe(true);
  });

  it("returns true when user status is BANNED", async () => {
    const mockPrisma = createMockPrismaWithUser({
      id: "user-2",
      status: "BANNED" as any,
      email: "banned@example.com",
      displayName: "Banned User",
    });

    const result = await isAccountSuspended(mockPrisma, "user-2");
    expect(result).toBe(true);
  });

  it("returns false when user status is ACTIVE", async () => {
    const mockPrisma = createMockPrismaWithUser({
      id: "user-3",
      status: "ACTIVE" as any,
      email: "active@example.com",
      displayName: "Active User",
    });

    const result = await isAccountSuspended(mockPrisma, "user-3");
    expect(result).toBe(false);
  });

  it("returns false when user is not found (user does not exist)", async () => {
    const mockPrisma = createMockPrismaWithUser(undefined);

    const result = await isAccountSuspended(mockPrisma, "nonexistent");
    expect(result).toBe(false);
  });

  it("calls findUnique with the correct user ID", async () => {
    const mockPrisma = createMockPrismaWithUser({
      id: "user-target",
      status: "SUSPENDED" as any,
      email: "test@example.com",
      displayName: "Test",
    });

    await isAccountSuspended(mockPrisma, "user-target");
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-target" },
      select: { status: true },
    });
  });

  it("only selects the status field (minimal query)", async () => {
    const mockPrisma = createMockPrismaWithUser({
      id: "user-4",
      status: "ACTIVE" as any,
      email: "test@example.com",
      displayName: "Test",
      passwordHash: "hashed",
      roles: ["LISTENER"],
    });

    await isAccountSuspended(mockPrisma, "user-4");
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-4" },
      select: { status: true },
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: getSuspendedUserError                                      */
/* ------------------------------------------------------------------ */

describe("getSuspendedUserError", () => {
  it("returns an error envelope with HTTP 404", () => {
    const result = getSuspendedUserError();
    expect(result.status).toBe(404);
  });

  it("includes a descriptive error message", () => {
    const result = getSuspendedUserError();
    expect(result.message).toContain("suspended");
  });

  it("returns a standardized error code", () => {
    const result = getSuspendedUserError();
    expect(result.code).toBe(SUSPENDED_USER_ERROR_CODES.ACCOUNT_SUSPENDED);
  });

  it("has success: false", () => {
    const result = getSuspendedUserError();
    expect(result.success).toBe(false);
  });

  it("produces consistent error codes across calls", () => {
    const error1 = getSuspendedUserError();
    const error2 = getSuspendedUserError();
    expect(error1.code).toBe(error2.code);
    expect(error1.status).toBe(error2.status);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: SUSPENDED_USER_ERROR_CODES constants                       */
/* ------------------------------------------------------------------ */

describe("SUSPENDED_USER_ERROR_CODES", () => {
  it("exports ACCOUNT_SUSPENDED code", () => {
    expect(SUSPENDED_USER_ERROR_CODES.ACCOUNT_SUSPENDED).toBeDefined();
    expect(typeof SUSPENDED_USER_ERROR_CODES.ACCOUNT_SUSPENDED).toBe("string");
  });
});

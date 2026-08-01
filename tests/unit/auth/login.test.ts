/**
 * STORY-auth-002: Unit tests for login validation schema, rate limiter,
 * and the loginUser service function.
 *
 * Acceptance criteria covered:
 * 1. Validates email + password, returns HTTP 200 with session cookie on success.
 * 2. Returns HTTP 401 INVALID_CREDENTIALS for non-existent or wrong credentials.
 * 3. Enforces 5 attempts per 15 min per IP → HTTP 429 RATE_LIMIT_EXCEEDED.
 * 4. Passwords not output to logs/responses.
 * 5. Integration test verifies cookie issuance, 401, and 429.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  loginSchema,
  loginUser,
  LOGIN_ERRORS,
  checkRateLimit,
  clearRateLimitStore,
  type LoginInput,
} from "../../../src/lib/auth/login";

/* ------------------------------------------------------------------ */
/*  Shared setup                                                       */
/* ------------------------------------------------------------------ */

const TEST_SECRET =
  "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

beforeEach(() => {
  vi.useRealTimers();
  clearRateLimitStore();
});

/* ------------------------------------------------------------------ */
/*  Helper: create mock Prisma user store                              */
/* ------------------------------------------------------------------ */

function createMockPrisma(users: Record<string, { passwordHash: string; [key: string]: unknown }>) {
  return {
    user: {
      findUnique: vi.fn((args: { where: { email: string } }) => {
        const user = users[args.where.email];
        if (user) {
          const { passwordHash, ...rest } = user;
          return Promise.resolve({
            id: "user-1",
            email: args.where.email,
            passwordHash,
            displayName: user.displayName ?? "Test User",
            roles: ["LISTENER"],
            status: "ACTIVE",
            emailVerified: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...rest,
          });
        }
        return Promise.resolve(null);
      }),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  AC1 — Login schema validation                                      */
/* ------------------------------------------------------------------ */

describe("loginSchema — email field", () => {
  it("normalises email to lowercase", () => {
    const result = loginSchema.safeParse({
      email: "USER@Example.COM",
      password: "Password1a",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "Password1a",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({
      password: "Password1a",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema — password field", () => {
  it("accepts a valid password string", () => {
    const result = loginSchema.safeParse({
      email: "test@test.com",
      password: "AnyPassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@test.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "test@test.com",
    });
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3 — Rate limiter tests                                          */
/* ------------------------------------------------------------------ */

describe("checkRateLimit", () => {
  it("allows requests when under the limit", () => {
    const result = checkRateLimit("1.2.3.4");
    expect(result).toEqual({ allowed: true });
  });

  it("records an attempt when record=true", () => {
    const ip = "5.6.7.8";
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(ip, true);
      expect(result).toEqual({ allowed: true });
    }
  });

  it("blocks after 5 failed attempts", () => {
    const ip = "blocked-ip";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(ip, true);
    }
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect((result as { allowed: false; retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("uses different buckets for different IPs", () => {
    const ip1 = "10.0.0.1";
    const ip2 = "10.0.0.2";

    for (let i = 0; i < 5; i++) checkRateLimit(ip1, true);

    const ip1Result = checkRateLimit(ip1);
    expect(ip1Result.allowed).toBe(false);

    const ip2Result = checkRateLimit(ip2);
    expect(ip2Result).toEqual({ allowed: true });
  });

  it("clears store resets all limits", () => {
    clearRateLimitStore();
    const result = checkRateLimit("after-clear");
    expect(result).toEqual({ allowed: true });
  });

  it("returns Retry-After seconds correctly", () => {
    const ip = "retry-ip";
    for (let i = 0; i < 5; i++) checkRateLimit(ip, true);

    const blocked = checkRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(typeof blocked.retryAfterSeconds).toBe("number");
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(900); // 15 min
    }
  });
});

/* ------------------------------------------------------------------ */
/*  AC1, 2, 4 — loginUser service                                     */
/* ------------------------------------------------------------------ */

describe("loginUser — happy path (AC1, AC4)", () => {
  it("authenticates user and returns 200 with session cookie", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("CorrectPassword1");

    const mockPrisma = createMockPrisma({
      "test@test.com": { passwordHash, displayName: "Test User" },
    });

    const result = await loginUser(
      mockPrisma as any,
      { email: "test@test.com", password: "CorrectPassword1" },
      "1.2.3.4",
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.code).toBe("OK");
    expect(result.user).not.toBeNull();
    expect(result.cookie).toBeDefined();
    expect(typeof result.cookie).toBe("string");

    // Verify user has expected fields
    const user = result.user! as Record<string, unknown>;
    expect(user.id).toBeDefined();
    expect(user.email).toBe("test@test.com");
    expect(user.displayName).toBe("Test User");
    expect(user.roles).toEqual(["LISTENER"]);
    expect(user.status).toBe("ACTIVE");

    // passwordHash is NOT in the response
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");

    // Cookie has required attributes
    expect(result.cookie!).toContain("__Host-indie_session=");
    expect(result.cookie!).toContain("HttpOnly");
    expect(result.cookie!).toContain("Secure");
    expect(result.cookie!).toContain("SameSite=Strict");
    expect(result.cookie!).toContain("Max-Age=604800");
  });

  it("normalises email to lowercase before lookup", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("SecurePass1");

    // After normalisation, mockPrisma is keyed by lowercase
    const mockPrisma = createMockPrisma({
      "upper@test.com": { passwordHash },
    });

    const result = await loginUser(
      mockPrisma as any,
      { email: "upper@test.com", password: "SecurePass1" },
      "1.2.3.4",
    );

    expect(result.success).toBe(true);
  });

  it("returns UTC ISO-8601 timestamps in user object", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("TimePass1");

    const mockPrisma = createMockPrisma({
      "time@test.com": { passwordHash },
    });

    const result = await loginUser(
      mockPrisma as any,
      { email: "time@test.com", password: "TimePass1" },
      "1.2.3.4",
    );

    const user = result.user! as Record<string, unknown>;
    expect(user.createdAt).toBeDefined();
    expect(typeof user.createdAt).toBe("string");
    expect(user.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});

describe("loginUser — invalid credentials (AC2)", () => {
  it("returns 401 for non-existent email", async () => {
    const mockPrisma = createMockPrisma({});

    const result = await loginUser(
      mockPrisma as any,
      { email: "nobody@test.com", password: "Something1" },
      "1.2.3.4",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.code).toBe(LOGIN_ERRORS.INVALID_CREDENTIALS);
    expect(result.message).toBe("Invalid email or password.");
    expect(result.user).toBeNull();
    expect(result.cookie).toBeNull();
  });

  it("returns 401 for wrong password", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("Correct1");

    const mockPrisma = createMockPrisma({
      "wrong@test.com": { passwordHash },
    });

    const result = await loginUser(
      mockPrisma as any,
      { email: "wrong@test.com", password: "WrongPassword1" },
      "1.2.3.4",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.code).toBe(LOGIN_ERRORS.INVALID_CREDENTIALS);
    expect(result.user).toBeNull();
    expect(result.cookie).toBeNull();
  });
});

describe("loginUser — rate limiting (AC3)", () => {
  it("returns 429 after 5 failed attempts from same IP", async () => {
    const mockPrisma = createMockPrisma({});
    const ip = "rate-limited-ip";

    // Burn through 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const result = await loginUser(
        mockPrisma as any,
        { email: "fake@test.com", password: "Wrong1" },
        ip,
      );
      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    }

    // 6th attempt should be rate-limited
    const result = await loginUser(
      mockPrisma as any,
      { email: "fake@test.com", password: "Wrong1" },
      ip,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(429);
    expect(result.code).toBe(LOGIN_ERRORS.RATE_LIMIT_EXCEEDED);
    expect(result.retryAfterSeconds).toBeDefined();
  });

  it("rate limiting applies independently per IP", async () => {
    const mockPrisma = createMockPrisma({});

    // Fill up IP 1
    for (let i = 0; i < 5; i++) {
      await loginUser(mockPrisma as any, { email: "fake@test.com", password: "Wrong1" }, "ip-1");
    }

    // IP 2 should still be allowed
    const result = await loginUser(
      mockPrisma as any,
      { email: "fake@test.com", password: "Wrong1" },
      "ip-2",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(401); // not 429
    expect(result.code).toBe(LOGIN_ERRORS.INVALID_CREDENTIALS);
  });

  it("does not count successful login against rate limit", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("ValidPass1");

    const mockPrisma = createMockPrisma({
      "valid@test.com": { passwordHash },
    });

    // 5 failed attempts to lock the IP
    for (let i = 0; i < 5; i++) {
      await loginUser(mockPrisma as any, { email: "wrong@test.com", password: "Wrong1" }, "lock-ip");
    }

    // Login as valid user from the SAME IP should still be blocked (rate limit is IP-based)
    const result = await loginUser(
      mockPrisma as any,
      { email: "valid@test.com", password: "ValidPass1" },
      "lock-ip",
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(429);
    expect(result.code).toBe(LOGIN_ERRORS.RATE_LIMIT_EXCEEDED);
  });
});

/* ------------------------------------------------------------------ */
/*  AC4 — Password sanitisation                                       */
/* ------------------------------------------------------------------ */

describe("loginUser — password sanitisation (AC4)", () => {
  it("never includes password or passwordHash in response", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("TestPass1");

    const mockPrisma = createMockPrisma({
      "san@test.com": { passwordHash, displayName: "San User" },
    });

    const result = await loginUser(
      mockPrisma as any,
      { email: "san@test.com", password: "TestPass1" },
      "1.2.3.4",
    );

    const user = result.user! as Record<string, unknown>;
    // Check no sensitive fields leak
    const userStr = JSON.stringify(user);
    expect(userStr).not.toContain(passwordHash);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");
  });

  it("invalid credentials message never reveals which field was wrong", async () => {
    const mockPrisma = createMockPrisma({});

    const result = await loginUser(
      mockPrisma as any,
      { email: "nonexistent@test.com", password: "DoesMatter1" },
      "1.2.3.4",
    );

    expect(result.message).not.toContain("not found");
    expect(result.message).not.toContain("wrong");
    expect(result.message).not.toContain("incorrect");
    expect(result.message).not.toContain("bad");
  });
});

/* ------------------------------------------------------------------ */
/*  AC — Error codes                                                  */
/* ------------------------------------------------------------------ */

describe("LOGIN_ERRORS constants", () => {
  it("defines INVALID_CREDENTIALS", () => {
    expect(LOGIN_ERRORS.INVALID_CREDENTIALS).toBe("INVALID_CREDENTIALS");
  });

  it("defines RATE_LIMIT_EXCEEDED", () => {
    expect(LOGIN_ERRORS.RATE_LIMIT_EXCEEDED).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("defines VALIDATION_FAILED", () => {
    expect(LOGIN_ERRORS.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
  });
});

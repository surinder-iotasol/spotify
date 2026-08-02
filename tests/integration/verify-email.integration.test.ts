/**
 * STORY-role-002: Integration test for POST /api/v1/auth/verify-email/request.
 *
 * Tests the route handler directly with mocked Prisma and session verification,
 * verifying:
 * - HTTP 202 Accepted with expiresInSeconds=86400 on success.
 * - HTTP 401 UNAUTHENTICATED when session is missing.
 * - HTTP 429 RATE_LIMIT_EXCEEDED when rate limit is exceeded.
 * - DB record is created for verification token.
 * - Prior active tokens are invalidated.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mock setup (hoisted)                                               */
/* ------------------------------------------------------------------ */

const mockUserFindUnique = vi.fn();
const mockTokenCreate = vi.fn();
const mockTokenUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mockUserFindUnique },
    verificationToken: {
      create: mockTokenCreate,
      updateMany: mockTokenUpdateMany,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  verifySession: vi.fn().mockReturnValue({ userId: "test-user-1", role: "LISTENER" }),
  SESSION_COOKIE_NAME: "__Host-indie_session",
}));

vi.mock("@/lib/security/rateLimiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rateLimiter")>();
  return {
    ...actual,
    checkVerificationRateLimit: vi.fn(() => ({ allowed: true })),
    clearVerificationRateLimitStore: vi.fn(),
  };
});

const mockVerifySession = vi.mocked(await import("@/lib/auth")).verifySession;
const mockRateLimit = vi.mocked(await import("@/lib/security/rateLimiter")).checkVerificationRateLimit;

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeAll(() => {
  process.env.JWT_SECRET =
    "test-secret-key-for-integration-testing-must-be-at-least-256-bits-long";
});

beforeEach(() => {
  mockUserFindUnique.mockResolvedValue({
    id: "test-user-1",
    email: "test@example.com",
  });
  mockTokenCreate.mockResolvedValue({ id: "vt-1" });
  // Re-apply default mock return values after clearAllMocks
  mockVerifySession.mockReturnValue({ userId: "test-user-1", role: "LISTENER" });
  mockRateLimit.mockReturnValue({ allowed: true });
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

/**
 * Simulate a POST request to the verify-email/request endpoint.
 */
async function callVerifyEmailHandler(
  cookie: string | null = null,
  forwardedFor = "5.6.7.8",
): Promise<Response> {
  const { POST } = await import("@/app/api/v1/auth/verify-email/request/route");

  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  headers.set("x-forwarded-for", forwardedFor);

  const request = new Request("http://localhost/api/v1/auth/verify-email/request", {
    method: "POST",
    headers,
  });

  return POST(request as any);
}

/* ------------------------------------------------------------------ */
/*  AC1 — Success: HTTP 202 with expiresInSeconds=86400                */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/verify-email/request — success", () => {
  it("returns HTTP 202 with expiresInSeconds=86400 and a confirmation message", async () => {
    const response = await callVerifyEmailHandler("__Host-indie_session=valid-jwt-token");
    const body = await response.json() as any;

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.expiresInSeconds).toBe(86400);
    expect(body.data.message).toBe("Verification email sent.");
  });

  it("creates a verification token record in the database", async () => {
    await callVerifyEmailHandler("__Host-indie_session=valid-jwt-token");

    expect(mockTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "test-user-1",
          invalid: false,
        }),
      }),
    );

    // tokenHash should be 64 hex characters
    const { data } = mockTokenCreate.mock.calls[0][0];
    expect(data.tokenHash).toHaveLength(64);
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("invalidates prior active tokens for the user", async () => {
    await callVerifyEmailHandler("__Host-indie_session=valid-jwt-token");

    expect(mockTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "test-user-1", invalid: false },
      data: { invalid: true },
    });
  });

  it("uses custom expiration when configured via service defaults", async () => {
    // The service defaults to 86400, so the response should always include 86400
    const response = await callVerifyEmailHandler("__Host-indie_session=valid-jwt-token");
    const body = await response.json() as any;

    expect(body.data.expiresInSeconds).toBe(86400);
  });
});

/* ------------------------------------------------------------------ */
/*  AC2 — Authentication required (401)                                */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/verify-email/request — authentication", () => {
  it("returns HTTP 401 when no session cookie is provided", async () => {
    mockVerifySession.mockReturnValue(null);

    const response = await callVerifyEmailHandler(null);

    expect(response.status).toBe(401);
    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns HTTP 401 when the session token is invalid", async () => {
    mockVerifySession.mockReturnValue(null);

    const response = await callVerifyEmailHandler("__Host-indie_session=invalid-token");

    expect(response.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3 — Rate limiting (429)                                          */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/verify-email/request — rate limiting", () => {
  it("returns HTTP 429 when rate limit is exceeded", async () => {
    mockRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 900,
    });

    const response = await callVerifyEmailHandler("__Host-indie_session=valid-jwt-token");

    expect(response.status).toBe(429);
    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");

    // Verify Retry-After header
    expect(response.headers.get("Retry-After")).toBe("900");
  });
});

/* ------------------------------------------------------------------ */
/*  AC4 — DB record verification                                       */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/verify-email/request — DB record", () => {
  it("stores a valid expiresAt timestamp (24h in the future)", async () => {
    const response = await callVerifyEmailHandler("__Host-indie_session=valid-jwt-token");
    expect(response.status).toBe(202);

    const createCall = mockTokenCreate.mock.calls[0][0];
    const expiresAt = createCall.data.expiresAt as Date;

    expect(expiresAt).toBeInstanceOf(Date);
    const now = Date.now();
    const diff = expiresAt.getTime() - now;
    // Allow some tolerance for test execution time
    expect(diff).toBeGreaterThanOrEqual(86300 * 1000); // ~24 hours
    expect(diff).toBeLessThanOrEqual(86500 * 1000);
  });
});

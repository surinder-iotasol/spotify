/**
 * STORY-auth-002: Integration test for POST /api/v1/auth/login.
 *
 * Tests the route handler directly with a mocked Prisma client,
 * verifying:
 * - HTTP 200 with session cookie on valid login.
 * - HTTP 401 INVALID_CREDENTIALS for wrong credentials.
 * - HTTP 429 RATE_LIMIT_EXCEEDED after 5 failed attempts.
 * - HTTP 422 for invalid request body.
 * - Sanitized user envelope in 200 response.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// vi.mock() is hoisted to the top of the file, so all shared state
// must live inside vi.hoisted() to avoid reference-before-init errors.
const {
  mockUserFindUnique,
  setupDefaults,
} = vi.hoisted(() => {
  const mockUserFindUnique = vi.fn();

  function setupDefaults() {
    mockUserFindUnique.mockResolvedValue(null);
  }

  return {
    mockUserFindUnique,
    setupDefaults,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
    },
  },
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

// vi.mock() for rate limiter — we want to test the real limiter but
// can clear its store between tests
vi.mock("@/lib/auth/login", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/login")>();
  return {
    ...actual,
    clearRateLimitStore: vi.fn(),
  };
});

import prisma from "@/lib/prisma";
import {
  loginSchema,
  loginUser,
  LOGIN_ERRORS,
} from "@/lib/auth/login";
import { apiErrorResponse, apiSuccessResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validation";

const TEST_SECRET =
  "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

async function callLoginHandler(
  body: unknown,
  forwardedFor = "1.2.3.4",
) {
  const validation = validateBody(body, loginSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          LOGIN_ERRORS.VALIDATION_FAILED,
          "Request validation failed.",
          validation.errors,
        ),
      ),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const result = await loginUser(prisma as any, validation.data!, forwardedFor);

  if (!result.success) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (result.retryAfterSeconds) {
      headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return new Response(
      JSON.stringify(
        apiErrorResponse(result.code, result.message),
      ),
      {
        status: result.status,
        headers,
      },
    );
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  if (result.cookie) {
    headers.set("Set-Cookie", result.cookie);
  }

  const envelope = apiSuccessResponse(
    result.user,
    { message: result.message },
  );

  return new Response(
    JSON.stringify(envelope),
    { status: 200, headers },
  );
}

/* ------------------------------------------------------------------ */
/*  Integration Tests — Happy Path                                     */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/login — Happy Path", () => {
  it("authenticates user and returns session cookie with sanitized user", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("CorrectPassword1");

    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordHash,
      displayName: "Integration User",
      roles: ["LISTENER"],
      status: "ACTIVE",
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await callLoginHandler({
      email: "user@example.com",
      password: "CorrectPassword1",
    });

    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie!).toContain("__Host-indie_session=");
    expect(setCookie!).toContain("HttpOnly");
    expect(setCookie!).toContain("Secure");
    expect(setCookie!).toContain("SameSite=Strict");
    expect(setCookie!).toContain("Max-Age=604800");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);

    const user = body.data as Record<string, unknown>;
    expect(user.id).toBe("user-1");
    expect(user.email).toBe("user@example.com");
    expect(user.displayName).toBe("Integration User");
    expect(user.roles).toEqual(["LISTENER"]);
    expect(user.status).toBe("ACTIVE");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password");
    expect(typeof user.createdAt).toBe("string");

    // message is in meta
    const meta = body.meta as Record<string, unknown>;
    expect(meta.message).toBe("Login successful.");
  });

  it("normalises email to lowercase before lookup", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("Secure123!");

    mockUserFindUnique.mockResolvedValue({
      id: "user-2",
      email: "MIXED@EXAMPLE.COM",
      passwordHash,
      displayName: "Mixed Case",
      roles: ["LISTENER"],
      status: "ACTIVE",
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await callLoginHandler({
      email: "MIXED@EXAMPLE.COM",
      password: "Secure123!",
    });

    expect(response.status).toBe(200);
    // findUnique should have been called with normalised email
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: "mixed@example.com" },
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Integration Tests — Invalid Credentials (401)                      */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/login — Invalid Credentials", () => {
  it("returns 401 for non-existent email", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const response = await callLoginHandler({
      email: "nobody@example.com",
      password: "Something1!",
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const err = body.error as { code: string; message: string };
    expect(err.code).toBe("INVALID_CREDENTIALS");
    expect(err.message).toBe("Invalid email or password.");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 for wrong password", async () => {
    const { hashPassword } = await import("@/lib/security/password");
    const passwordHash = await hashPassword("RightPassword1!");

    mockUserFindUnique.mockResolvedValue({
      id: "user-3",
      email: "wrong@example.com",
      passwordHash,
      displayName: "Wrong Password",
      roles: ["LISTENER"],
      status: "ACTIVE",
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await callLoginHandler({
      email: "wrong@example.com",
      password: "WrongPassword1!",
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const err2 = body.error as { code: string; message: string };
    expect(err2.code).toBe("INVALID_CREDENTIALS");
    expect(err2.message).toBe("Invalid email or password.");
  });
});

/* ------------------------------------------------------------------ */
/*  Integration Tests — Rate Limiting (429)                            */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/login — Rate Limiting", () => {
  it("returns 429 after 5 failed attempts from same IP", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const ip = "192.168.1.100";

    // First 5 attempts — should return 401
    for (let i = 0; i < 5; i++) {
      const response = await callLoginHandler(
        { email: "fake@example.com", password: "Wrong1!" },
        ip,
      );
      expect(response.status).toBe(401);
    }

    // 6th attempt — should be rate limited
    const response = await callLoginHandler(
      { email: "fake@example.com", password: "Wrong1!" },
      ip,
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const rateErr = body.error as { code: string };
    expect(rateErr.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(response.headers.get("retry-after")).not.toBeNull();
  });

  it("applies rate limiting independently per IP", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    // Exhaust IP 1
    for (let i = 0; i < 5; i++) {
      await callLoginHandler(
        { email: "fake@example.com", password: "Wrong1!" },
        "10.0.0.1",
      );
    }

    // IP 2 should still be allowed
    const response = await callLoginHandler(
      { email: "fake@example.com", password: "Wrong1!" },
      "10.0.0.2",
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("retry-after")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Integration Tests — Validation Errors (422)                        */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/login — Validation Errors", () => {
  it("returns 422 for missing email", async () => {
    const response = await callLoginHandler({
      password: "SomePassword1!",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const valErr = body.error as { code: string; details?: unknown[] };
    expect(valErr.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(valErr.details)).toBe(true);
    expect((valErr.details as unknown[]).length).toBeGreaterThan(0);
  });

  it("returns 422 for missing password", async () => {
    const response = await callLoginHandler({
      email: "user@example.com",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as { code: string }).code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 for invalid email format", async () => {
    const response = await callLoginHandler({
      email: "not-an-email",
      password: "Password1!",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as { code: string }).code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 for empty password", async () => {
    const response = await callLoginHandler({
      email: "user@example.com",
      password: "",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as { code: string }).code).toBe("VALIDATION_FAILED");
  });
});

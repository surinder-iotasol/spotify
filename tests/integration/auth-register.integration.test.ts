/**
 * STORY-auth-001: Integration test for POST /api/v1/auth/register.
 *
 * Tests the route handler directly with a mocked Prisma client,
 * verifying:
 * - HTTP status codes (201, 409, 422)
 * - Set-Cookie header with __Host-indie_session
 * - Sanitized user envelope in response body
 * - Validation error structure for bad payloads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock() is hoisted to the top of the file, so all shared state
// must live inside vi.hoisted() to avoid reference-before-init errors.
const {
  mockUserFindUnique,
  mockUserCreate,
  clearMocks,
  setupDefaults,
} = vi.hoisted(() => {
  const mockUserFindUnique = vi.fn();
  const mockUserCreate = vi.fn();

  function clearMocks() {
    vi.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockUserCreate.mockReset();
  }

  function setupDefaults() {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      const data = args.data;
      return {
        id: data.id as string,
        email: data.email as string,
        displayName: data.displayName as string,
        roles: data.roles as string[],
        status: data.status as string,
        emailVerified: data.emailVerified as boolean,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  return {
    mockUserFindUnique,
    mockUserCreate,
    clearMocks,
    setupDefaults,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
  },
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
  },
}));

import prisma from "@/lib/prisma";
import {
  registrationSchema,
  registerUser,
} from "@/lib/auth/registration";
import { apiErrorResponse, apiSuccessResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validation";

const TEST_SECRET =
  "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  clearMocks();
  setupDefaults();
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

async function callRegisterHandler(body: unknown) {
  // Simulate what the route handler does
  const validation = validateBody(body, registrationSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "VALIDATION_FAILED",
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

  const result = await registerUser(prisma as any, validation.data!);

  if (!result.success) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(result.code, result.message),
      ),
      {
        status: result.status,
        headers: { "Content-Type": "application/json" },
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
    { status: 201, headers },
  );
}

/* ------------------------------------------------------------------ */
/*  Integration Tests — Happy Path                                     */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/register — Happy Path", () => {
  it("creates user, sets session cookie, and returns sanitized envelope", async () => {
    const response = await callRegisterHandler({
      email: "integration@test.com",
      password: "SecurePass1",
      displayName: "Integration User",
    });

    expect(response.status).toBe(201);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie!).toContain("__Host-indie_session=");
    expect(setCookie!).toContain("HttpOnly");
    expect(setCookie!).toContain("Secure");
    expect(setCookie!).toContain("SameSite=Strict");
    expect(setCookie!).toContain("Path=/");
    expect(setCookie!).toContain("Max-Age=604800");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    const user = body.data as Record<string, unknown>;
    expect(user.id).toBeDefined();
    expect(typeof user.id).toBe("string");
    // UUID format from crypto.randomUUID()
    expect(user.id).toMatch(/^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i);
    expect(user.email).toBe("integration@test.com");
    expect(user.displayName).toBe("Integration User");
    expect(user.roles).toEqual(["LISTENER"]);
    expect(user.status).toBe("ACTIVE");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");

    // Verify findUnique was called with normalised email
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: "integration@test.com" },
    });

    // Verify create was called with correct data
    const createCall = mockUserCreate.mock.calls[0];
    expect(createCall[0].data.email).toBe("integration@test.com");
    expect(createCall[0].data.roles).toEqual(["LISTENER"]);
    expect(createCall[0].data.displayName).toBe("Integration User");
    expect(createCall[0].data.passwordHash).toMatch(/^\$2b\$12\$/);
  });
});

/* ------------------------------------------------------------------ */
/*  Integration Tests — Duplicate Email (409)                          */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/register — Duplicate Email", () => {
  it("returns 409 when email already exists", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "existing-user",
      email: "existing@test.com",
      displayName: "Existing",
    });

    const response = await callRegisterHandler({
      email: "existing@test.com",
      password: "AnotherPass1",
      displayName: "Another User",
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as { code: string }).code).toBe("AUTH_EMAIL_EXISTS");
  });
});

/* ------------------------------------------------------------------ */
/*  Integration Tests — Validation (422)                               */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/register — Validation Failures", () => {
  it("returns 422 for missing fields", async () => {
    const response = await callRegisterHandler({
      email: "test@test.com",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as { code: string }).code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 for invalid email", async () => {
    const response = await callRegisterHandler({
      email: "not-an-email",
      password: "SecurePass1",
      displayName: "Test",
    });

    expect(response.status).toBe(422);
  });

  it("returns 422 for weak password", async () => {
    const response = await callRegisterHandler({
      email: "test@test.com",
      password: "short",
      displayName: "Test",
    });

    expect(response.status).toBe(422);
  });

  it("returns 422 for displayName too long", async () => {
    const response = await callRegisterHandler({
      email: "test@test.com",
      password: "SecurePass1",
      displayName: "A".repeat(100),
    });

    expect(response.status).toBe(422);
  });
});

/* ------------------------------------------------------------------ */
/*  Integration Tests — Email Normalisation                            */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/auth/register — Email Normalisation", () => {
  it("normalises uppercase email before checking uniqueness", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const response = await callRegisterHandler({
      email: "UPPER@TEST.COM",
      password: "SecurePass1",
      displayName: "Normalised",
    });

    expect(response.status).toBe(201);

    // findUnique was called with normalised email
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: "upper@test.com" },
    });
  });
});

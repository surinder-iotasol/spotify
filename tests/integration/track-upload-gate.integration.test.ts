/**
 * STORY-role-004: Integration tests for POST /api/v1/tracks endpoint.
 *
 * Verifies:
 * - Unverified users receive HTTP 403 EMAIL_NOT_VERIFIED
 * - Verified users with ARTIST role proceed successfully
 * - Unauthenticated requests receive HTTP 401 UNAUTHENTICATED
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mocks (use vi.hoisted to coexist with vi.mock hoisting)            */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => {
  const mockPrismaUserFindUnique = vi.fn();
  return { mockPrismaUserFindUnique };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: mocks.mockPrismaUserFindUnique,
    },
  },
}));

let mockVerifyTokenImpl: ((token: string) => { sub: string; userId: string; role: string; emailVerified: boolean; roles: string[]; exp: number } | null) | null = null;

vi.mock("@/lib/auth", () => ({
  verifyToken: vi.fn((token: string) => {
    return mockVerifyTokenImpl?.(token) ?? null;
  }),
  verifySession: vi.fn((cookieHeader: string | null) => {
    if (!cookieHeader) return null;
    return mockVerifyTokenImpl?.(cookieHeader) ?? null;
  }),
})) as unknown as typeof import("@/lib/auth");

// Import after setting up vi.mock
import { POST } from "@/app/api/v1/tracks/route";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(
  body?: Record<string, unknown>,
  cookie?: string,
): Parameters<typeof POST>[0] {
  return {
    json: vi.fn().mockResolvedValue(body ?? {}),
    headers: {
      get: (key: string) => {
        if (key === "cookie" && cookie) return cookie;
        return null;
      },
    },
    nextUrl: { pathname: "/api/v1/tracks" },
    method: "POST",
  } as unknown as Parameters<typeof POST>[0];
}

/* ------------------------------------------------------------------ */
/*  Test Data                                                          */
/* ------------------------------------------------------------------ */

const VALID_JWT_PAYLOAD = {
  sub: "user-artist-123",
  userId: "user-artist-123",
  role: "ARTIST",
  emailVerified: true,
  roles: ["ARTIST"],
  exp: Math.floor(Date.now() / 1000) + 604800,
};

const UNVERIFIED_JWT_PAYLOAD = {
  ...VALID_JWT_PAYLOAD,
  userId: "user-artist-456",
  emailVerified: false,
};

/* ------------------------------------------------------------------ */
/*  Integration Tests                                                  */
/* ------------------------------------------------------------------ */

describe("POST /api/v1/tracks — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to returning the valid payload
    mockVerifyTokenImpl = () => VALID_JWT_PAYLOAD;
    // Default prisma returns nothing (triggers 401 User not found)
    mocks.mockPrismaUserFindUnique.mockResolvedValue(null);
  });

  describe("unauthenticated requests", () => {
    it("returns HTTP 401 UNAUTHENTICATED when no session cookie is present", async () => {
      mockVerifyTokenImpl = () => null;

      const response = await POST(makeRequest(undefined, ""));
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHENTICATED");
    });

    it("returns HTTP 401 UNAUTHENTICATED when token is invalid", async () => {
      mockVerifyTokenImpl = () => null;

      const response = await POST(makeRequest(undefined, "invalid=token"));
      expect(response.status).toBe(401);
    });
  });

  describe("unverified users", () => {
    it("returns HTTP 403 EMAIL_NOT_VERIFIED for unverified ARTIST", async () => {
      mockVerifyTokenImpl = () => UNVERIFIED_JWT_PAYLOAD;
      mocks.mockPrismaUserFindUnique.mockResolvedValue({
        emailVerified: false,
        roles: ["ARTIST"],
      });

      const response = await POST(makeRequest(undefined, "__Host-indie_session=token"));
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("EMAIL_NOT_VERIFIED");
      expect(body.error.message).toContain("Email verification is required");
      expect(body.error.resendUrl).toBe("/verify-email");
    });

    it("includes meta with timestamp and requestId in 403 response", async () => {
      mockVerifyTokenImpl = () => UNVERIFIED_JWT_PAYLOAD;
      mocks.mockPrismaUserFindUnique.mockResolvedValue({
        emailVerified: false,
        roles: ["ARTIST"],
      });

      const response = await POST(makeRequest(undefined, "__Host-indie_session=token"));
      const body = await response.json();

      expect(body.meta).toHaveProperty("timestamp");
      expect(body.meta).toHaveProperty("requestId");
    });
  });

  describe("verified users", () => {
    it("returns HTTP 202 for verified ARTIST user", async () => {
      mockVerifyTokenImpl = () => VALID_JWT_PAYLOAD;
      mocks.mockPrismaUserFindUnique.mockResolvedValue({
        emailVerified: true,
        roles: ["ARTIST"],
      });

      const response = await POST(makeRequest(undefined, "__Host-indie_session=token"));
      expect(response.status).toBe(202);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe("Track upload initiated.");
    });
  });
});

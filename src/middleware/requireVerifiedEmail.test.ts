/**
 * STORY-role-004: Unit tests for requireVerifiedEmail middleware.
 *
 * Verifies that the middleware:
 * - Passes through requests for verified users
 * - Rejects requests for unverified users with HTTP 403
 * - Does not gate streaming, search, or playlist endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import {
  requireVerifiedEmail,
  createEmailNotVerifiedResponse,
  verifyEmailNotGatedPath,
  isGatedPath,
  type UserClaims,
  type NextRequestLike,
} from "./requireVerifiedEmail";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock next/server for edge-compatible testing
vi.mock("next/server", () => ({
  NextRequest: class {
    _url: string;
    _method: string;
    _headers: Record<string, string>;
    _nextUrl: { pathname: string };

    constructor(url: string, init?: RequestInit) {
      this._url = url;
      this._method = init?.method ?? "GET";
      this._headers = {
        cookie: (init?.headers as any)?.cookie ?? "",
        ...((init?.headers as any) ?? {}),
      };
      this._nextUrl = {
        pathname: new URL(url).pathname,
      };
    }

    get url(): string {
      return this._url;
    }

    get method(): string {
      return this._method;
    }

    get headers(): { get(key: string): string | null } {
      return {
        get: (key: string) => this._headers[key.toLowerCase()] ?? null,
      };
    }

    get nextUrl(): { pathname: string } {
      return this._nextUrl;
    }
  },

  NextResponse: {
    next: vi.fn(() => ({})),
    json: vi.fn((data, init?: { status?: number }) => ({
      ...data,
      status: init?.status ?? 200,
      headers: new Map(),
    })),
  },

  Response: class {
    status: number;
    headers: Headers;
    body: string;

    constructor(body: string, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this.headers = new Headers();
      this.body = body;
    }
  },
}));

/* ------------------------------------------------------------------ */
/*  Test helpers                                                         */
/* ------------------------------------------------------------------ */

function makeRequest(url: string, method = "POST", headers: Record<string, string> = {}): any {
  return {
    url,
    method,
    headers: {
      get: (key: string) => {
        // Lowercase key lookup
        const lowerKey = key.toLowerCase();
        // Check direct match or cookie header
        if (lowerKey === "cookie" && headers.cookie) return headers.cookie;
        if (headers[lowerKey]) return headers[lowerKey];
        return null;
      },
    },
    nextUrl: { pathname: new URL(url).pathname },
  } as unknown as NextRequest;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("requireVerifiedEmail", () => {
  describe("createEmailNotVerifiedResponse", () => {
    it("returns HTTP 403 with EMAIL_NOT_VERIFIED code", async () => {
      const response = createEmailNotVerifiedResponse("https://example.com/resend");
      expect(response.status).toBe(403);
      const json = JSON.parse(await response.text());
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("includes resendUrl in error payload", async () => {
      const response = createEmailNotVerifiedResponse("https://resend.url");
      const json = JSON.parse(await response.text());
      expect(json.error.resendUrl).toBe("https://resend.url");
    });

    it("uses default resendUrl when not provided", async () => {
      const response = createEmailNotVerifiedResponse(undefined);
      const json = JSON.parse(await response.text());
      expect(json.error.resendUrl).toContain("/verify-email");
    });
  });

  describe("verifyEmailNotGatedPath", () => {
    it("returns true for streaming endpoints", () => {
      expect(verifyEmailNotGatedPath("/api/v1/tracks/abc123/stream")).toBe(true);
      expect(verifyEmailNotGatedPath("/api/v1/tracks/stream")).toBe(true);
    });

    it("returns true for search endpoints", () => {
      expect(verifyEmailNotGatedPath("/api/v1/search")).toBe(true);
      expect(verifyEmailNotGatedPath("/api/v1/search/artist")).toBe(true);
    });

    it("returns true for playlist endpoints", () => {
      expect(verifyEmailNotGatedPath("/api/v1/playlists")).toBe(true);
      expect(verifyEmailNotGatedPath("/api/v1/playlists/abc123")).toBe(true);
    });

    it("returns true for following endpoints", () => {
      expect(verifyEmailNotGatedPath("/api/v1/users/following")).toBe(true);
      expect(verifyEmailNotGatedPath("/api/v1/users/following/artist")).toBe(true);
    });

    it("returns true for public playback endpoints (track listing GET)", () => {
      // /api/v1/tracks is NOT in the ungated list — it's conditionally gated
      // by isGatedPath() for POST requests. GET track listing proceeds via
      // isGatedPath(method=GET) returning false, then verifyEmailNotGatedPath
      // also returns false, but requireVerifiedEmail's fail-safe path allows
      // verified users through. For unverified users, only gated paths are blocked.
      expect(verifyEmailNotGatedPath("/api/v1/tracks/popular")).toBe(true);
    });

    it("returns false for gated upload endpoint (handled by isGatedPath)", () => {
      // /api/v1/tracks is conditionally gated — isGatedPath handles POST
      expect(verifyEmailNotGatedPath("/api/v1/tracks")).toBe(false);
    });

    it("returns false for upload intent endpoint", () => {
      // Upload intent is explicitly gated via isGatedPath
      expect(verifyEmailNotGatedPath("/api/v1/tracks/upload-intent")).toBe(false);
    });

    it("returns false for unknown endpoints by default", () => {
      expect(verifyEmailNotGatedPath("/api/v1/admin/users")).toBe(false);
    });
  });

  describe("isGatedPath", () => {
    it("returns true for POST to /api/v1/tracks", () => {
      expect(isGatedPath("/api/v1/tracks", "POST")).toBe(true);
    });

    it("returns true for POST to /api/v1/tracks/upload-intent", () => {
      expect(isGatedPath("/api/v1/tracks/upload-intent", "POST")).toBe(true);
    });

    it("returns false for GET to /api/v1/tracks (public listing)", () => {
      expect(isGatedPath("/api/v1/tracks", "GET")).toBe(false);
    });

    it("returns false for non-upload paths", () => {
      expect(isGatedPath("/api/v1/tracks/abc123/stream", "POST")).toBe(false);
      expect(isGatedPath("/api/v1/search", "POST")).toBe(false);
    });
  });

  describe("middleware integration (pure check)", () => {
    it("allows verified users with ARTIST role to proceed to upload", () => {
      const user: UserClaims = {
        userId: "user-1",
        emailVerified: true,
        roles: ["ARTIST"],
      };

      const result = requireVerifiedEmail(user, "/api/v1/tracks/upload-intent");
      expect(result.allowed).toBe(true);
      expect(result.status).toBeUndefined();
    });

    it("allows verified users with ADMIN role to proceed", () => {
      const user: UserClaims = {
        userId: "user-2",
        emailVerified: true,
        roles: ["ADMIN"],
      };

      const result = requireVerifiedEmail(user, "/api/v1/tracks/upload-intent");
      expect(result.allowed).toBe(true);
    });

    it("rejects unverified users with HTTP 403", () => {
      const user: UserClaims = {
        userId: "user-3",
        emailVerified: false,
        roles: ["ARTIST"],
      };

      const result = requireVerifiedEmail(user, "/api/v1/tracks/upload-intent", "https://resend.url");
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(403);
    });

    it("does not gate streaming endpoints for unverified users", () => {
      const user: UserClaims = {
        userId: "user-4",
        emailVerified: false,
        roles: ["ARTIST"],
      };

      const result = requireVerifiedEmail(user, "/api/v1/tracks/abc123/stream");
      expect(result.allowed).toBe(true);
      expect(result.status).toBeUndefined();
    });

    it("does not gate search endpoints for unverified users", () => {
      const user: UserClaims = {
        userId: "user-5",
        emailVerified: false,
        roles: ["ARTIST"],
      };

      const result = requireVerifiedEmail(user, "/api/v1/search");
      expect(result.allowed).toBe(true);
    });

    it("does not gate playlist endpoints for unverified users", () => {
      const user: UserClaims = {
        userId: "user-6",
        emailVerified: false,
        roles: ["ARTIST"],
      };

      const result = requireVerifiedEmail(user, "/api/v1/playlists");
      expect(result.allowed).toBe(true);
    });
  });
});

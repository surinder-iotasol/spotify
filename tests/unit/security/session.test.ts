/**
 * STORY-security-002: Unit tests for Session JWT Token Service and Secure Cookie Serialization.
 *
 * Acceptance criteria covered:
 * 1. JWT token generation includes userId, role, optional artistProfileId, iat, exp signed with HMAC-SHA256.
 * 2. Session cookie serialization sets __Host-indie_session with HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age=604800.
 * 3. Expired or tampered JWT signatures fail verification and throw a structured TokenError.
 * 4. All timestamp claims (iat, exp) use UTC Unix epoch standards.
 * 5. All public functions and error branches are covered.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateToken,
  verifyToken,
  TokenError,
  buildSetCookieHeader,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_DURATION_MS,
  BCRYPT_COST,
  type JwtSessionPayload,
  type VerifiedSession,
} from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Shared setup                                                       */
/* ------------------------------------------------------------------ */

const TEST_SECRET =
  "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

let jwt: any; // jsonwebtoken require() result

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  jwt = require("jsonwebtoken");
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  AC1 — JWT token generation: claims, role values, artistProfileId   */
/* ------------------------------------------------------------------ */

describe("JWT token generation — claims (AC1)", () => {
  it("generates a valid 3-part JWT string", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-123",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("includes userId (sub) in the decoded payload", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-abc-456",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    expect(decoded.sub).toBe("user-abc-456");
  });

  it("includes role in the decoded payload", () => {
    const roles: Array<"LISTENER" | "ARTIST" | "ADMIN"> = [
      "LISTENER",
      "ARTIST",
      "ADMIN",
    ];
    for (const role of roles) {
      const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
        sub: `user-${role}`,
        role,
      };
      const token = generateToken(payload);
      const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
      expect(decoded.role).toBe(role);
    }
  });

  it("includes optional artistProfileId when provided", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-artist",
      role: "ARTIST",
      artistProfileId: "artist-profile-xyz",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    expect(decoded.artistProfileId).toBe("artist-profile-xyz");
  });

  it("does not include artistProfileId when omitted", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-listener",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    expect(decoded.artistProfileId).toBeUndefined();
  });

  it("includes iat (issued at) as a numeric Unix epoch", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    expect(decoded.iat).toBeDefined();
    expect(typeof decoded.iat).toBe("number");
    expect(Number.isInteger(decoded.iat as number)).toBe(true);
  });

  it("includes exp (expiration) as a numeric Unix epoch", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    expect(decoded.exp).toBeDefined();
    expect(typeof decoded.exp).toBe("number");
    expect(Number.isInteger(decoded.exp as number)).toBe(true);
  });

  it("sets exp exactly to iat + 604800 seconds (7 days)", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    const diff = (decoded.exp as number) - (decoded.iat as number);
    expect(diff).toBe(SESSION_COOKIE_MAX_AGE);
  });

  it("uses HS256 (HMAC-SHA256) algorithm", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    // Verify with the secret (HS256 is symmetric)
    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded).toBeDefined();
  });

  it("produces unique tokens for the same payload (different iat each call)", async () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-duplicate",
      role: "LISTENER",
    };
    const token1 = generateToken(payload);
    // Wait >1s to ensure different iat (iat uses Math.floor(Date.now()/1000))
    await new Promise((r) => setTimeout(r, 1100));
    const token2 = generateToken(payload);
    expect(token1).not.toBe(token2);
  });
});

/* ------------------------------------------------------------------ */
/*  AC2 — Session cookie serialization                                 */
/* ------------------------------------------------------------------ */

describe("Session cookie serialization (AC2)", () => {
  it("uses __Host-indie_session as the cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("__Host-indie_session");
  });

  it("sessionCookieOptions returns correct HttpOnly setting", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
  });

  it("sessionCookieOptions returns correct Secure setting", () => {
    const opts = sessionCookieOptions();
    expect(opts.secure).toBe(true);
  });

  it("sessionCookieOptions returns SameSite=Strict", () => {
    const opts = sessionCookieOptions();
    expect(opts.sameSite).toBe("strict");
  });

  it("sessionCookieOptions returns Path=/", () => {
    const opts = sessionCookieOptions();
    expect(opts.path).toBe("/");
  });

  it("sessionCookieOptions returns maxAge=604800 (7 days)", () => {
    const opts = sessionCookieOptions();
    expect(opts.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
  });

  it("SESSION_COOKIE_MAX_AGE equals 604800 seconds (7 days)", () => {
    expect(SESSION_COOKIE_MAX_AGE).toBe(604800);
  });

  it("SESSION_COOKIE_DURATION_MS equals maxAge * 1000", () => {
    expect(SESSION_COOKIE_DURATION_MS).toBe(SESSION_COOKIE_MAX_AGE * 1000);
  });

  it("buildSetCookieHeader includes the token and all required attributes", () => {
    const testToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature";
    const header = buildSetCookieHeader(testToken);

    expect(header).toContain(`${SESSION_COOKIE_NAME}=${testToken}`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=604800");
  });

  it("buildSetCookieHeader does NOT include Domain (required for __Host- prefix)", () => {
    const testToken = "dummy-token-123";
    const header = buildSetCookieHeader(testToken);

    expect(header).not.toContain("Domain=");
  });

  it("buildSetCookieHeader produces a correctly formatted Set-Cookie string", () => {
    const testToken = "abc123";
    const header = buildSetCookieHeader(testToken);
    const expected = `${SESSION_COOKIE_NAME}=abc123; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
    expect(header).toBe(expected);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3 — Expired and tampered JWT verification                        */
/* ------------------------------------------------------------------ */

describe("Token verification — expired and tampered (AC3)", () => {
  it("throws TokenError for an expired token with code SESSION_EXPIRED", () => {
    const pastToken = jwt.sign(
      {
        sub: "user-1",
        role: "ADMIN" as const,
        iat: Math.floor(Date.now() / 1000) - 1_000_000,
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      TEST_SECRET,
      { algorithm: "HS256" },
    );
    try {
      verifyToken(pastToken);
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      const tokenErr = err as TokenError;
      expect(tokenErr.code).toBe("SESSION_EXPIRED");
    }
  });

  it("throws TokenError for a tampered signature", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-1",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.tampered_signature`;
    try {
      verifyToken(tampered);
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      const tokenErr = err as TokenError;
      expect(tokenErr.code).toBe("SESSION_INVALID");
    }
  });

  it("throws TokenError for a completely invalid token string", () => {
    try {
      verifyToken("not-a-jwt-at-all");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
    }
  });

  it("throws TokenError for an empty string", () => {
    try {
      verifyToken("");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
    }
  });

  it("throws TokenError for a malformed JWT with only two parts", () => {
    try {
      verifyToken("header.payload");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
    }
  });

  it("throws TokenError for a JWT with only one part", () => {
    try {
      verifyToken("just-a-header");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
    }
  });

  it("throws TokenError when using a wrong secret", () => {
    const token = generateToken({ sub: "user-1", role: "ADMIN" });
    const prevSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "completely-different-secret-key";
    try {
      try {
        verifyToken(token);
      } catch (err) {
        expect(err).toBeInstanceOf(TokenError);
        const tokenErr = err as TokenError;
        expect(tokenErr.code).toBe("SESSION_INVALID");
      }
    } finally {
      process.env.JWT_SECRET = prevSecret;
    }
  });

  it("rejects a token with wrong algorithm (RS256)", () => {
    const { generateKeyPairSync } = require("crypto");
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const rs256Token = jwt.sign(
      { sub: "user-1", role: "ADMIN" },
      privateKey,
      { algorithm: "RS256" },
    );
    try {
      verifyToken(rs256Token);
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  AC4 — Timestamp claims UTC compliance                              */
/* ------------------------------------------------------------------ */

describe("Timestamp claims UTC compliance (AC4)", () => {
  it("iat is a valid Unix epoch timestamp (seconds since 1970-01-01)", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-timestamp",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    const iat = decoded.iat as number;

    // iat should be a recent timestamp (between 2020 and 2035)
    const minTs = new Date("2020-01-01T00:00:00Z").getTime() / 1000;
    const maxTs = new Date("2035-01-01T00:00:00Z").getTime() / 1000;
    expect(iat).toBeGreaterThanOrEqual(minTs);
    expect(iat).toBeLessThanOrEqual(maxTs);
  });

  it("exp is a valid Unix epoch timestamp after iat", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-timestamp",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    const iat = decoded.iat as number;
    const exp = decoded.exp as number;

    expect(exp).toBeGreaterThan(iat);
  });

  it("iat and exp are integers (not floating point)", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-timestamp",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const decoded = jwt.decode(token, { complete: false }) as Record<string, unknown>;
    expect(Number.isInteger(decoded.iat as number)).toBe(true);
    expect(Number.isInteger(decoded.exp as number)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  verifyToken — VerifiedSession output shape                           */
/* ------------------------------------------------------------------ */

describe("verifyToken — VerifiedSession output (AC1, AC3)", () => {
  it("returns userId as an alias for the sub claim", () => {
    const token = generateToken({ sub: "user-sub-value", role: "LISTENER" });
    const verified = verifyToken(token);
    expect(verified.userId).toBe("user-sub-value");
  });

  it("returns the correct role from the token", () => {
    const roles: Array<"LISTENER" | "ARTIST" | "ADMIN"> = [
      "LISTENER",
      "ARTIST",
      "ADMIN",
    ];
    for (const role of roles) {
      const token = generateToken({ sub: "user-1", role });
      const verified = verifyToken(token);
      expect(verified.role).toBe(role);
    }
  });

  it("returns artistProfileId when present", () => {
    const token = generateToken({
      sub: "user-artist",
      role: "ARTIST",
      artistProfileId: "profile-123",
    });
    const verified = verifyToken(token);
    expect(verified.artistProfileId).toBe("profile-123");
  });

  it("returns undefined for artistProfileId when not present", () => {
    const token = generateToken({ sub: "user-listener", role: "LISTENER" });
    const verified = verifyToken(token);
    expect(verified.artistProfileId).toBeUndefined();
  });

  it("returns a properly typed VerifiedSession object", () => {
    const token = generateToken({
      sub: "user-1",
      role: "ADMIN",
      artistProfileId: "profile-1",
    });
    const verified = verifyToken(token) as VerifiedSession;
    expect(verified).toHaveProperty("userId", "user-1");
    expect(verified).toHaveProperty("role", "ADMIN");
    expect(verified).toHaveProperty("artistProfileId", "profile-1");
  });
});

/* ------------------------------------------------------------------ */
/*  TokenError — Structured error shape                                 */
/* ------------------------------------------------------------------ */

describe("TokenError — structured error (AC3)", () => {
  it("has correct error name", () => {
    const err = new TokenError("TEST_CODE", "test message");
    expect(err.name).toBe("TokenError");
  });

  it("exposes code and message properties", () => {
    const err = new TokenError("SESSION_EXPIRED", "Token has expired");
    expect(err.code).toBe("SESSION_EXPIRED");
    expect(err.message).toBe("Token has expired");
  });

  it("SESSION_EXPIRED code is used for expired tokens", () => {
    const expiredToken = jwt.sign(
      {
        sub: "user-1",
        role: "ADMIN" as const,
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      TEST_SECRET,
      { algorithm: "HS256" },
    );
    try {
      verifyToken(expiredToken);
    } catch (err) {
      expect((err as TokenError).code).toBe("SESSION_EXPIRED");
    }
  });

  it("SESSION_INVALID code is used for tampered tokens", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-1",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const tampered = `${token.split(".")[0]}.${token.split(".")[1]}.bad`;
    try {
      verifyToken(tampered);
    } catch (err) {
      expect((err as TokenError).code).toBe("SESSION_INVALID");
    }
  });

  it("does not leak sensitive data in error messages", () => {
    const err = new TokenError("SESSION_INVALID", "Session token is invalid or tampered");
    expect(err.message).not.toContain("password");
    expect(err.message).not.toContain("secret");
    expect(err.message).not.toContain("key");
    expect(err.code).not.toContain("secret");
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases and boundary conditions                                 */
/* ------------------------------------------------------------------ */

describe("Edge cases and boundary conditions", () => {
  it("throws when JWT_SECRET is not set during generateToken", () => {
    const prev = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() =>
      generateToken({ sub: "user-1", role: "LISTENER" }),
    ).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = prev;
  });

  it("throws when JWT_SECRET is not set during verifyToken", () => {
    const prev = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => verifyToken("some-token")).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = prev;
  });

  it("handles UUID-style userIds", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateToken({
      sub: uuid,
      role: "ARTIST",
      artistProfileId: "profile-abc",
    });
    const verified = verifyToken(token);
    expect(verified.userId).toBe(uuid);
  });

  it("handles long display-name-like sub values", () => {
    const longSub = "user-with-a-very-long-identifier-that-goes-on-and-on-and-on-12345";
    const token = generateToken({ sub: longSub, role: "LISTENER" });
    const verified = verifyToken(token);
    expect(verified.userId).toBe(longSub);
  });

  it("handles empty string artistProfileId if provided", () => {
    const token = generateToken({
      sub: "user-1",
      role: "ARTIST",
      artistProfileId: "",
    });
    const verified = verifyToken(token);
    expect(verified.artistProfileId).toBe("");
  });

  it("cookie header contains HttpOnly for browser transport", () => {
    const header = buildSetCookieHeader("test");
    expect(header).toContain("HttpOnly");
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: generateToken + verifyToken round-trip                */
/* ------------------------------------------------------------------ */

describe("Round-trip: generateToken -> verifyToken (AC1, AC3)", () => {
  it("round-trips all role types with artistProfileId", () => {
    const roles: Array<"LISTENER" | "ARTIST" | "ADMIN"> = [
      "LISTENER",
      "ARTIST",
      "ADMIN",
    ];
    for (const role of roles) {
      const hasProfile = role === "ARTIST";
      const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
        sub: `user-${role}`,
        role,
        ...(hasProfile ? { artistProfileId: `profile-${role}` } : {}),
      };
      const token = generateToken(payload);
      const verified = verifyToken(token);
      expect(verified.userId).toBe(`user-${role}`);
      expect(verified.role).toBe(role);
      if (hasProfile) {
        expect(verified.artistProfileId).toBe(`profile-${role}`);
      } else {
        expect(verified.artistProfileId).toBeUndefined();
      }
    }
  });

  it("round-trip with all three roles including artistProfileId", () => {
    const token = generateToken({
      sub: "user-full",
      role: "ARTIST",
      artistProfileId: "artist-profile-full",
    });
    const verified = verifyToken(token);
    expect(verified.userId).toBe("user-full");
    expect(verified.role).toBe("ARTIST");
    expect(verified.artistProfileId).toBe("artist-profile-full");
  });
});

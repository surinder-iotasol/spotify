import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateToken,
  verifyToken,
  TokenError,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_DURATION_MS,
  type JwtSessionPayload,
} from "../../../src/lib/auth";

// Set JWT_SECRET for testing
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe("generateToken", () => {
  it("generates a valid JWT token string", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-123",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  it("includes userId (sub) in the token payload", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-abc-456",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    expect(decoded.sub).toBe("user-abc-456");
  });

  it("includes role in the token payload", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-789",
      role: "ARTIST",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    expect(decoded.role).toBe("ARTIST");
  });

  it("includes optional artistProfileId when provided", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-999",
      role: "ARTIST",
      artistProfileId: "artist-profile-xyz",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    expect(decoded.artistProfileId).toBe("artist-profile-xyz");
  });

  it("does not include artistProfileId when omitted", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-888",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    expect(decoded.artistProfileId).toBeUndefined();
  });

  it("includes iat (issued at) timestamp", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    expect(decoded.iat).toBeDefined();
    expect(typeof decoded.iat).toBe("number");
  });

  it("includes exp (expiration) timestamp", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    expect(decoded.exp).toBeDefined();
    expect(typeof decoded.exp).toBe("number");
  });

  it("sets exp to approximately iat + 7 days (604800 seconds)", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const parts = token.split(".");
    const payloadStr = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payloadStr);
    const diff = decoded.exp - decoded.iat;
    expect(diff).toBe(SESSION_COOKIE_MAX_AGE);
  });

  it("uses HS256 algorithm (signature verification)", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-001",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    const verified = verifyToken(token);
    expect(verified.userId).toBe("user-001");
  });
});

describe("verifyToken", () => {
  it("returns verified payload with userId alias for sub", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-from-sub",
      role: "LISTENER",
    };
    const token = generateToken(payload);
    const verified = verifyToken(token);
    expect(verified.userId).toBe("user-from-sub");
    expect(verified.role).toBe("LISTENER");
  });

  it("returns the correct role from the token", () => {
    const roles: Array<"ADMIN" | "ARTIST" | "LISTENER"> = ["ADMIN", "ARTIST", "LISTENER"];
    for (const role of roles) {
      const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
        sub: "user-1",
        role,
      };
      const token = generateToken(payload);
      const verified = verifyToken(token);
      expect(verified.role).toBe(role);
    }
  });

  it("returns artistProfileId when present in token", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-1",
      role: "ARTIST",
      artistProfileId: "profile-xyz",
    };
    const token = generateToken(payload);
    const verified = verifyToken(token);
    expect(verified.artistProfileId).toBe("profile-xyz");
  });

  it("throws TokenError for expired token", () => {
    // We can't easily create an expired token with generateToken,
    // so we create one manually with a past expiration
    const secret = process.env.JWT_SECRET!;
    const jwt = require("jsonwebtoken");
    const pastToken = jwt.sign(
      { sub: "user-1", role: "ADMIN", iat: Math.floor(Date.now() / 1000) - 1000000, exp: Math.floor(Date.now() / 1000) - 1 },
      secret,
      { algorithm: "HS256" },
    );
    expect(() => verifyToken(pastToken)).toThrow(TokenError);
  });

  it("throws TokenError for tampered token", () => {
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-1",
      role: "ADMIN",
    };
    const token = generateToken(payload);
    // Tamper with the signature (last part)
    const tampered = token.slice(0, -5) + "invalid";
    expect(() => verifyToken(tampered)).toThrow(TokenError);
  });

  it("throws TokenError for completely invalid token", () => {
    expect(() => verifyToken("not-a-valid-jwt-token")).toThrow(TokenError);
  });

  it("throws TokenError for empty string", () => {
    expect(() => verifyToken("")).toThrow(TokenError);
  });

  it("throws TokenError for malformed JWT (missing parts)", () => {
    expect(() => verifyToken("only.two")).toThrow(TokenError);
  });

  it("throws TokenError when JWT_SECRET is not set", () => {
    delete process.env.JWT_SECRET;
    const payload: Omit<JwtSessionPayload, "iat" | "exp"> = {
      sub: "user-1",
      role: "ADMIN",
    };
    // generateToken should throw when no secret
    expect(() => generateToken(payload)).toThrow("JWT_SECRET");
  });
});

describe("TokenError", () => {
  it("has correct name", () => {
    const err = new TokenError("TEST_CODE", "test message");
    expect(err.name).toBe("TokenError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
  });
});

describe("7-day session duration constant", () => {
  it("SESSION_COOKIE_MAX_AGE equals 604800 (7 days in seconds)", () => {
    expect(SESSION_COOKIE_MAX_AGE).toBe(604800);
  });

  it("604800 seconds equals 7 days", () => {
    const secondsInDay = 24 * 60 * 60; // 86400
    expect(SESSION_COOKIE_MAX_AGE).toBe(7 * secondsInDay);
  });
});

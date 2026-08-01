import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  checkAdminAccess,
  isAdminRoute,
  parseCookies,
  extractSessionToken,
  getSessionClaims,
  isAdmin,
  RBAC_ERRORS,
  ADMIN_ROLES,
  ADMIN_ROUTE_PATTERNS,
} from "../../../src/lib/auth/middleware";
import { generateToken, SESSION_COOKIE_NAME, TokenError } from "../../../src/lib/auth";

// Set JWT_SECRET for testing
beforeAll(() => {
  process.env.JWT_SECRET =
    "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  parseCookies                                                       */
/* ------------------------------------------------------------------ */

describe("parseCookies", () => {
  it("returns empty object for null", () => {
    expect(parseCookies(null)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseCookies("")).toEqual({});
  });

  it("parses a simple cookie header", () => {
    const result = parseCookies("foo=bar");
    expect(result).toEqual({ foo: "bar" });
  });

  it("parses multiple cookies", () => {
    const result = parseCookies("a=1; b=2; c=3");
    expect(result).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("handles __Host- prefix cookies", () => {
    const result = parseCookies(`__Host-indie_session=token123`);
    expect(result[SESSION_COOKIE_NAME]).toBe("token123");
  });

  it("handles cookie values with equals signs", () => {
    const result = parseCookies("a=1; b=value=with=equals");
    expect(result.b).toBe("value=with=equals");
  });
});

/* ------------------------------------------------------------------ */
/*  extractSessionToken                                                */
/* ------------------------------------------------------------------ */

describe("extractSessionToken", () => {
  it("returns null for null cookie header", () => {
    expect(extractSessionToken(null)).toBeNull();
  });

  it("returns null when session cookie is not present", () => {
    expect(extractSessionToken("other=value")).toBeNull();
  });

  it("extracts the session token when present", () => {
    const result = extractSessionToken(`${SESSION_COOKIE_NAME}=abc123token`);
    expect(result).toBe("abc123token");
  });

  it("extracts token from a longer cookie header", () => {
    const result = extractSessionToken(
      "other=value1; " + SESSION_COOKIE_NAME + "=mySessionToken; another=value2",
    );
    expect(result).toBe("mySessionToken");
  });
});

/* ------------------------------------------------------------------ */
/*  isAdminRoute                                                       */
/* ------------------------------------------------------------------ */

describe("isAdminRoute", () => {
  it("matches /admin exactly", () => {
    expect(isAdminRoute("/admin")).toBe(true);
  });

  it("matches /admin/dashboard", () => {
    expect(isAdminRoute("/admin/dashboard")).toBe(true);
  });

  it("matches /admin/users", () => {
    expect(isAdminRoute("/admin/users")).toBe(true);
  });

  it("matches /admin with nested path", () => {
    expect(isAdminRoute("/admin/some/deep/nested/path")).toBe(true);
  });

  it("matches /api/v1/admin exactly", () => {
    expect(isAdminRoute("/api/v1/admin")).toBe(true);
  });

  it("matches /api/v1/admin/users", () => {
    expect(isAdminRoute("/api/v1/admin/users")).toBe(true);
  });

  it("matches /api/v1/admin/reports", () => {
    expect(isAdminRoute("/api/v1/admin/reports")).toBe(true);
  });

  it("does not match /api/v1/admin-not-real (different path)", () => {
    // /api/v1/admin-not-real is NOT /api/v1/admin/* — it's a different path
    // The pattern match uses path prefix with trailing slash
    expect(isAdminRoute("/api/v1/admin-not-real")).toBe(false);
  });

  it("does not match non-admin routes", () => {
    expect(isAdminRoute("/")).toBe(false);
    expect(isAdminRoute("/login")).toBe(false);
    expect(isAdminRoute("/artists")).toBe(false);
    expect(isAdminRoute("/api/v1/tracks")).toBe(false);
    expect(isAdminRoute("/api/v1/search")).toBe(false);
    expect(isAdminRoute("/api/v1/users/me")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  isAdmin                                                            */
/* ------------------------------------------------------------------ */

describe("isAdmin", () => {
  it("returns true for ADMIN role", () => {
    expect(isAdmin("ADMIN")).toBe(true);
  });

  it("returns false for LISTENER role", () => {
    expect(isAdmin("LISTENER")).toBe(false);
  });

  it("returns false for ARTIST role", () => {
    expect(isAdmin("ARTIST")).toBe(false);
  });

  it("ADMIN_ROLES only contains ADMIN", () => {
    expect(ADMIN_ROLES).toEqual(["ADMIN"]);
  });
});

/* ------------------------------------------------------------------ */
/*  checkAdminAccess — unauthenticated paths                           */
/* ------------------------------------------------------------------ */

describe("checkAdminAccess — unauthenticated access", () => {
  it("allows non-admin paths without authentication", () => {
    const result = checkAdminAccess({
      pathname: "/artists/abc",
      cookieHeader: null,
    });
    expect(result.authorized).toBe(true);
  });

  it("denies /admin without session cookie (401 UNAUTHENTICATED)", () => {
    const result = checkAdminAccess({
      pathname: "/admin/dashboard",
      cookieHeader: null,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
      expect(result.code).toBe(RBAC_ERRORS.UNAUTHENTICATED);
    }
  });

  it("denies /api/v1/admin/users without session cookie (401)", () => {
    const result = checkAdminAccess({
      pathname: "/api/v1/admin/users",
      cookieHeader: null,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
      expect(result.code).toBe(RBAC_ERRORS.UNAUTHENTICATED);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  checkAdminAccess — valid admin token                               */
/* ------------------------------------------------------------------ */

describe("checkAdminAccess — valid ADMIN token", () => {
  it("allows /admin when user has ADMIN role", () => {
    const token = generateToken({ sub: "admin-user-1", role: "ADMIN" });
    const result = checkAdminAccess({
      pathname: "/admin/dashboard",
      cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.userId).toBe("admin-user-1");
      expect(result.role).toBe("ADMIN");
    }
  });

  it("allows /api/v1/admin/reports when user has ADMIN role", () => {
    const token = generateToken({ sub: "admin-user-2", role: "ADMIN" });
    const result = checkAdminAccess({
      pathname: "/api/v1/admin/reports",
      cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.userId).toBe("admin-user-2");
    }
  });

  it("includes artistProfileId in response when present in token", () => {
    const token = generateToken({
      sub: "artist-admin-1",
      role: "ADMIN",
      artistProfileId: "profile-xyz",
    });
    const result = checkAdminAccess({
      pathname: "/admin",
      cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    });
    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.artistProfileId).toBe("profile-xyz");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  checkAdminAccess — non-admin roles (Listener/Artist)               */
/* ------------------------------------------------------------------ */

describe("checkAdminAccess — non-admin roles get 403", () => {
  it("denies /admin for LISTENER role (403 FORBIDDEN_INSUFFICIENT_ROLE)", () => {
    const token = generateToken({ sub: "listener-1", role: "LISTENER" });
    const result = checkAdminAccess({
      pathname: "/admin/dashboard",
      cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(403);
      expect(result.code).toBe(RBAC_ERRORS.FORBIDDEN_INSUFFICIENT_ROLE);
    }
  });

  it("denies /api/v1/admin/users for ARTIST role (403)", () => {
    const token = generateToken({ sub: "artist-1", role: "ARTIST" });
    const result = checkAdminAccess({
      pathname: "/api/v1/admin/users",
      cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(403);
      expect(result.code).toBe(RBAC_ERRORS.FORBIDDEN_INSUFFICIENT_ROLE);
    }
  });

  it("returns correct error message for insufficient role", () => {
    const token = generateToken({ sub: "listener-1", role: "LISTENER" });
    const result = checkAdminAccess({
      pathname: "/admin",
      cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.message).toContain(
        "You do not have sufficient permissions",
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/*  checkAdminAccess — expired/tampered tokens                         */
/* ------------------------------------------------------------------ */

describe("checkAdminAccess — expired or invalid tokens", () => {
  it("returns SESSION_EXPIRED for expired token (401)", () => {
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET!;
    const pastToken = jwt.sign(
      {
        sub: "user-1",
        role: "ADMIN",
        iat: Math.floor(Date.now() / 1000) - 1000000,
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      secret,
      { algorithm: "HS256" },
    );
    const result = checkAdminAccess({
      pathname: "/admin",
      cookieHeader: `${SESSION_COOKIE_NAME}=${pastToken}`,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
      expect(result.code).toBe(RBAC_ERRORS.SESSION_EXPIRED);
    }
  });

  it("returns UNAUTHENTICATED for tampered token", () => {
    const token = generateToken({ sub: "user-1", role: "ADMIN" });
    const tampered = token.slice(0, -5) + "invalid";
    const result = checkAdminAccess({
      pathname: "/admin",
      cookieHeader: `${SESSION_COOKIE_NAME}=${tampered}`,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
    }
  });

  it("returns UNAUTHENTICATED for completely invalid token", () => {
    const result = checkAdminAccess({
      pathname: "/admin",
      cookieHeader: `${SESSION_COOKIE_NAME}=not-a-real-jwt-token`,
    });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
    }
  });

  it("allows non-admin route with invalid token", () => {
    const result = checkAdminAccess({
      pathname: "/artists/abc",
      cookieHeader: `${SESSION_COOKIE_NAME}=invalid`,
    });
    expect(result.authorized).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  getSessionClaims                                                   */
/* ------------------------------------------------------------------ */

describe("getSessionClaims", () => {
  it("returns userId from token", () => {
    const token = generateToken({ sub: "user-123", role: "LISTENER" });
    const claims = getSessionClaims(token);
    expect(claims.userId).toBe("user-123");
    expect(claims.role).toBe("LISTENER");
  });

  it("includes artistProfileId when present", () => {
    const token = generateToken({
      sub: "user-456",
      role: "ARTIST",
      artistProfileId: "profile-789",
    });
    const claims = getSessionClaims(token);
    expect(claims.artistProfileId).toBe("profile-789");
  });

  it("throws TokenError for invalid token", () => {
    expect(() => getSessionClaims("invalid-token")).toThrow(TokenError);
  });
});

/* ------------------------------------------------------------------ */
/*  Route pattern coverage                                             */
/* ------------------------------------------------------------------ */

describe("ADMIN_ROUTE_PATTERNS", () => {
  it("contains expected admin route patterns", () => {
    expect(ADMIN_ROUTE_PATTERNS).toContain("/admin");
    expect(ADMIN_ROUTE_PATTERNS).toContain("/api/v1/admin");
  });

  it("has exactly 2 patterns", () => {
    expect(ADMIN_ROUTE_PATTERNS).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  RBAC_ERRORS constants                                              */
/* ------------------------------------------------------------------ */

describe("RBAC_ERRORS", () => {
  it("contains expected error codes", () => {
    expect(RBAC_ERRORS.UNAUTHENTICATED).toBe("UNAUTHENTICATED");
    expect(RBAC_ERRORS.FORBIDDEN_INSUFFICIENT_ROLE).toBe(
      "FORBIDDEN_INSUFFICIENT_ROLE",
    );
    expect(RBAC_ERRORS.SESSION_EXPIRED).toBe("SESSION_EXPIRED");
    expect(RBAC_ERRORS.SESSION_INVALID).toBe("SESSION_INVALID");
  });
});

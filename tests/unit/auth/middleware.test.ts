import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  parseCookies,
  isAdminRoute,
  extractSessionToken,
  getSessionClaims,
  isAdmin,
  checkRouteAccess,
  ROUTE_MIN_ROLE,
  ROUTE_CATEGORIES,
  PUBLIC_PATHS,
  ROLE_HIERARCHY,
  RouteAccessResult,
} from "../../../src/lib/auth/middleware";
import {
  generateToken,
  TokenError,
  type UserRole,
} from "../../../src/lib/auth";

/* ------------------------------------------------------------------ */
/*  Setup                                                               */
/* ------------------------------------------------------------------ */

beforeAll(() => {
  process.env.JWT_SECRET =
    "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

/* ------------------------------------------------------------------ */
/*  parseCookies                                                        */
/* ------------------------------------------------------------------ */

describe("parseCookies", () => {
  it("returns an empty object when cookieHeader is null", () => {
    expect(parseCookies(null)).toEqual({});
  });

  it("returns an empty object when cookieHeader is empty string", () => {
    expect(parseCookies("")).toEqual({});
  });

  it("parses a simple cookie into key-value pairs", () => {
    const result = parseCookies("__Host-indie_session=abc123");
    expect(result).toEqual({ "__Host-indie_session": "abc123" });
  });

  it("parses multiple cookies", () => {
    const result = parseCookies("__Host-indie_session=abc; other=def");
    expect(result).toEqual({ "__Host-indie_session": "abc", other: "def" });
  });

  it("trims whitespace around cookie parts", () => {
    const result = parseCookies("__Host-indie_session=abc ; other=def ");
    expect(result).toEqual({ "__Host-indie_session": "abc", other: "def" });
  });

  it("ignores cookie entries without = delimiter", () => {
    const result = parseCookies("bare; __Host-indie_session=abc");
    // "bare" has no = so it gets [c.slice(0,0), c.slice(1)] which is ["", "are"]
    expect(result["__Host-indie_session"]).toBe("abc");
  });
});

/* ------------------------------------------------------------------ */
/*  extractSessionToken                                                 */
/* ------------------------------------------------------------------ */

describe("extractSessionToken", () => {
  it("returns null when cookieHeader is null", () => {
    expect(extractSessionToken(null)).toBeNull();
  });

  it("returns null when session cookie is absent", () => {
    expect(extractSessionToken("other=value")).toBeNull();
  });

  it("returns the session token when present", () => {
    const token = extractSessionToken("__Host-indie_session=my-jwt-token");
    expect(token).toBe("my-jwt-token");
  });
});

/* ------------------------------------------------------------------ */
/*  Route categories and constants                                      */
/* ------------------------------------------------------------------ */

describe("ROUTE_CATEGORIES", () => {
  it("includes /admin", () => {
    expect(ROUTE_CATEGORIES.ADMIN).toBe("/admin");
  });
  it("includes /api/v1/admin", () => {
    expect(ROUTE_CATEGORIES.API_ADMIN).toBe("/api/v1/admin");
  });
  it("includes /api/v1/artist", () => {
    expect(ROUTE_CATEGORIES.ARTIST).toBe("/api/v1/artist");
  });
  it("includes /api/v1/playlists", () => {
    expect(ROUTE_CATEGORIES.PLAYLISTS).toBe("/api/v1/playlists");
  });
  it("includes /api/v1/reports", () => {
    expect(ROUTE_CATEGORIES.REPORTS).toBe("/api/v1/reports");
  });
});

/* ------------------------------------------------------------------ */
/*  PUBLIC_PATHS                                                        */
/* ------------------------------------------------------------------ */

describe("PUBLIC_PATHS", () => {
  it("includes /api/v1/search", () => {
    expect(PUBLIC_PATHS).toContain("/api/v1/search");
  });
});

/* ------------------------------------------------------------------ */
/*  ROLE_HIERARCHY                                                      */
/* ------------------------------------------------------------------ */

describe("ROLE_HIERARCHY", () => {
  it("defines LISTENER at level 1", () => {
    expect(ROLE_HIERARCHY.LISTENER).toBe(1);
  });
  it("defines ARTIST at level 2", () => {
    expect(ROLE_HIERARCHY.ARTIST).toBe(2);
  });
  it("defines ADMIN at level 3", () => {
    expect(ROLE_HIERARCHY.ADMIN).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/*  ROUTE_MIN_ROLE                                                      */
/* ------------------------------------------------------------------ */

describe("ROUTE_MIN_ROLE", () => {
  it("maps /api/v1/admin/ to ADMIN", () => {
    expect(ROUTE_MIN_ROLE["/api/v1/admin/"]).toBe("ADMIN");
  });
  it("maps /admin/ to ADMIN", () => {
    expect(ROUTE_MIN_ROLE["/admin/"]).toBe("ADMIN");
  });
  it("maps /api/v1/artist/ to ARTIST", () => {
    expect(ROUTE_MIN_ROLE["/api/v1/artist/"]).toBe("ARTIST");
  });
  it("maps /api/v1/playlists/ to LISTENER", () => {
    expect(ROUTE_MIN_ROLE["/api/v1/playlists/"]).toBe("LISTENER");
  });
  it("maps /api/v1/reports/ to LISTENER", () => {
    expect(ROUTE_MIN_ROLE["/api/v1/reports/"]).toBe("LISTENER");
  });
});

/* ------------------------------------------------------------------ */
/*  isAdmin                                                             */
/* ------------------------------------------------------------------ */

describe("isAdmin", () => {
  it("returns true for ADMIN role", () => {
    expect(isAdmin("ADMIN")).toBe(true);
  });
  it("returns false for ARTIST role", () => {
    expect(isAdmin("ARTIST")).toBe(false);
  });
  it("returns false for LISTENER role", () => {
    expect(isAdmin("LISTENER")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  isAdminRoute                                                        */
/* ------------------------------------------------------------------ */

describe("isAdminRoute", () => {
  it("matches /admin", () => {
    expect(isAdminRoute("/admin")).toBe(true);
  });
  it("matches /admin/users", () => {
    expect(isAdminRoute("/admin/users")).toBe(true);
  });
  it("matches /admin/moderation", () => {
    expect(isAdminRoute("/admin/moderation")).toBe(true);
  });
  it("matches /api/v1/admin", () => {
    expect(isAdminRoute("/api/v1/admin")).toBe(true);
  });
  it("matches /api/v1/admin/users", () => {
    expect(isAdminRoute("/api/v1/admin/users")).toBe(true);
  });
  it("returns false for non-admin route", () => {
    expect(isAdminRoute("/api/v1/artist/123")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  getSessionClaims                                                    */
/* ------------------------------------------------------------------ */

describe("getSessionClaims", () => {
  it("returns userId, role, and artistProfileId for a valid token", () => {
    const token = generateToken({
      sub: "user-42",
      role: "ARTIST",
      artistProfileId: "artist-profile-42",
    });
    const claims = getSessionClaims(token);
    expect(claims.userId).toBe("user-42");
    expect(claims.role).toBe("ARTIST");
    expect(claims.artistProfileId).toBe("artist-profile-42");
  });

  it("returns undefined artistProfileId when not in token", () => {
    const token = generateToken({ sub: "user-42", role: "LISTENER" });
    const claims = getSessionClaims(token);
    expect(claims.artistProfileId).toBeUndefined();
  });

  it("throws TokenError for invalid token", () => {
    expect(() => getSessionClaims("invalid-token")).toThrow(TokenError);
  });
});

/* ------------------------------------------------------------------ */
/*  checkRouteAccess — Role matching and hierarchy                       */
/* ------------------------------------------------------------------ */

describe("checkRouteAccess", () => {
  const testSecret =
    "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  // ----- Public routes bypass role checks -----

  describe("public route exemption", () => {
    it("returns authorized for /api/v1/search without any cookie", () => {
      const result = checkRouteAccess({
        pathname: "/api/v1/search",
        cookieHeader: null,
      });
      expect(result).toEqual({ authorized: true });
    });

    it("returns authorized for /api/v1/search?q=foo without any cookie", () => {
      const result = checkRouteAccess({
        pathname: "/api/v1/search?q=foo",
        cookieHeader: null,
      });
      expect(result).toEqual({ authorized: true });
    });

    it("returns authorized for /api/v1/tracks/id/stream without any cookie", () => {
      const result = checkRouteAccess({
        pathname: "/api/v1/tracks/abc/stream",
        cookieHeader: null,
      });
      expect(result).toEqual({ authorized: true });
    });
  });

  // ----- /admin/* — ADMIN only -----

  describe("/admin/* — ADMIN required", () => {
    it("returns 401 when no session cookie", () => {
      const result = checkRouteAccess({
        pathname: "/admin/users",
        cookieHeader: null,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(401);
    });

    it("returns 401 when session is expired/tampered", () => {
      const result = checkRouteAccess({
        pathname: "/admin/users",
        cookieHeader: "__Host-indie_session=tampered-token",
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(401);
    });

    it("returns 403 for LISTENER on /admin", () => {
      const token = generateToken({ sub: "user-1", role: "LISTENER" });
      const result = checkRouteAccess({
        pathname: "/admin/users",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(403);
    });

    it("returns 403 for ARTIST on /admin", () => {
      const token = generateToken({ sub: "user-2", role: "ARTIST" });
      const result = checkRouteAccess({
        pathname: "/admin/users",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(403);
    });

    it("returns 200 (authorized) for ADMIN on /admin", () => {
      const token = generateToken({ sub: "admin-1", role: "ADMIN" });
      const result = checkRouteAccess({
        pathname: "/admin/users",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole }).authorized).toBe(true);
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole }).role).toBe("ADMIN");
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole }).userId).toBe("admin-1");
    });

    it("returns 200 (authorized) for ADMIN on /api/v1/admin", () => {
      const token = generateToken({ sub: "admin-1", role: "ADMIN" });
      const result = checkRouteAccess({
        pathname: "/api/v1/admin/reports",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });
  });

  // ----- /api/v1/artist/* — ARTIST or ADMIN -----

  describe("/api/v1/artist/* — ARTIST or ADMIN required", () => {
    it("returns 401 when no session cookie", () => {
      const result = checkRouteAccess({
        pathname: "/api/v1/artist/profile",
        cookieHeader: null,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(401);
    });

    it("returns 403 for LISTENER on /api/v1/artist", () => {
      const token = generateToken({ sub: "user-1", role: "LISTENER" });
      const result = checkRouteAccess({
        pathname: "/api/v1/artist/profile",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(403);
    });

    it("returns 200 (authorized) for ARTIST on /api/v1/artist", () => {
      const token = generateToken({
        sub: "user-2",
        role: "ARTIST",
        artistProfileId: "artist-profile-2",
      });
      const result = checkRouteAccess({
        pathname: "/api/v1/artist/profile",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole; artistProfileId?: string }).authorized).toBe(true);
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole; artistProfileId?: string }).role).toBe("ARTIST");
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole; artistProfileId?: string }).userId).toBe("user-2");
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole; artistProfileId?: string }).artistProfileId).toBe(
        "artist-profile-2",
      );
    });

    it("returns 200 (authorized) for ADMIN on /api/v1/artist", () => {
      const token = generateToken({ sub: "admin-1", role: "ADMIN" });
      const result = checkRouteAccess({
        pathname: "/api/v1/artist/profile",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });
  });

  // ----- /api/v1/playlists/* — any authenticated user -----

  describe("/api/v1/playlists/* — any authenticated user required", () => {
    it("returns 401 when no session cookie", () => {
      const result = checkRouteAccess({
        pathname: "/api/v1/playlists",
        cookieHeader: null,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(401);
    });

    it("returns 200 (authorized) for LISTENER on /api/v1/playlists", () => {
      const token = generateToken({ sub: "user-1", role: "LISTENER" });
      const result = checkRouteAccess({
        pathname: "/api/v1/playlists",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole }).authorized).toBe(true);
      expect((result as RouteAccessResult & { authorized: true; userId: string; role: UserRole }).role).toBe("LISTENER");
    });

    it("returns 200 (authorized) for ARTIST on /api/v1/playlists", () => {
      const token = generateToken({ sub: "user-2", role: "ARTIST" });
      const result = checkRouteAccess({
        pathname: "/api/v1/playlists",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });

    it("returns 200 (authorized) for ADMIN on /api/v1/playlists", () => {
      const token = generateToken({ sub: "admin-1", role: "ADMIN" });
      const result = checkRouteAccess({
        pathname: "/api/v1/playlists",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });
  });

  // ----- /api/v1/reports/* — any authenticated user -----

  describe("/api/v1/reports/* — any authenticated user required", () => {
    it("returns 401 when no session cookie", () => {
      const result = checkRouteAccess({
        pathname: "/api/v1/reports/123",
        cookieHeader: null,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(401);
    });

    it("returns 200 (authorized) for LISTENER on /api/v1/reports", () => {
      const token = generateToken({ sub: "user-1", role: "LISTENER" });
      const result = checkRouteAccess({
        pathname: "/api/v1/reports/123",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });

    it("returns 200 (authorized) for ARTIST on /api/v1/reports", () => {
      const token = generateToken({ sub: "user-2", role: "ARTIST" });
      const result = checkRouteAccess({
        pathname: "/api/v1/reports/123",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });

    it("returns 200 (authorized) for ADMIN on /api/v1/reports", () => {
      const token = generateToken({ sub: "admin-1", role: "ADMIN" });
      const result = checkRouteAccess({
        pathname: "/api/v1/reports/123",
        cookieHeader: `__Host-indie_session=${token}`,
      });
      expect((result as RouteAccessResult & { authorized: true }).authorized).toBe(true);
    });
  });

  // ----- Non-protected routes -----

  describe("non-protected routes bypass", () => {
    it("returns authorized for / page", () => {
      const result = checkRouteAccess({ pathname: "/", cookieHeader: null });
      expect(result).toEqual({ authorized: true });
    });

    it("returns authorized for /login", () => {
      const result = checkRouteAccess({ pathname: "/login", cookieHeader: null });
      expect(result).toEqual({ authorized: true });
    });

    it("returns authorized for /register", () => {
      const result = checkRouteAccess({ pathname: "/register", cookieHeader: null });
      expect(result).toEqual({ authorized: true });
    });
  });

  // ----- Expired token handling -----

  describe("expired token handling", () => {
    it("returns 401 for expired token on any protected route", () => {
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        {
          sub: "user-1",
          role: "ADMIN",
          iat: Math.floor(Date.now() / 1000) - 1000000,
          exp: Math.floor(Date.now() / 1000) - 1,
        },
        testSecret,
        { algorithm: "HS256" },
      );
      const result = checkRouteAccess({
        pathname: "/admin/users",
        cookieHeader: `__Host-indie_session=${expiredToken}`,
      });
      expect((result as RouteAccessResult & { authorized: false }).authorized).toBe(false);
      expect((result as RouteAccessResult & { authorized: false }).status).toBe(401);
    });
  });
});

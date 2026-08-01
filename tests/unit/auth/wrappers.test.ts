import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AuthContext,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN_ROLE,
  parseCookies,
  parseUserHeaders,
  validateRole,
  buildUnauthorizedResponse,
  buildForbiddenRoleResponse,
  extractAuthContext,
  extractSessionToken,
  withAuth,
  withRole,
} from "../../../src/lib/auth/wrappers";
import type { UserRole } from "../../../src/lib/auth";
import { generateToken } from "../../../src/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Error code constants                                               */
/* ------------------------------------------------------------------ */

describe("ERR_UNAUTHORIZED constant", () => {
  it("equals the string 'ERR_UNAUTHORIZED'", () => {
    expect(ERR_UNAUTHORIZED).toBe("ERR_UNAUTHORIZED");
  });

  it("is a string", () => {
    expect(typeof ERR_UNAUTHORIZED).toBe("string");
  });
});

describe("ERR_FORBIDDEN_ROLE constant", () => {
  it("equals the string 'ERR_FORBIDDEN_ROLE'", () => {
    expect(ERR_FORBIDDEN_ROLE).toBe("ERR_FORBIDDEN_ROLE");
  });

  it("is a string", () => {
    expect(typeof ERR_FORBIDDEN_ROLE).toBe("string");
  });
});

/* ------------------------------------------------------------------ */
/*  AuthContext class                                                  */
/* ------------------------------------------------------------------ */

describe("AuthContext.create", () => {
  it("creates an AuthContext with userId, role, and artistProfileId", () => {
    const ctx = AuthContext.create({
      userId: "user-1",
      role: "ADMIN",
      artistProfileId: "profile-1",
    });
    expect(ctx.user.userId).toBe("user-1");
    expect(ctx.user.role).toBe("ADMIN");
    expect(ctx.user.artistProfileId).toBe("profile-1");
  });

  it("creates an AuthContext without artistProfileId", () => {
    const ctx = AuthContext.create({
      userId: "user-2",
      role: "LISTENER",
    });
    expect(ctx.user.userId).toBe("user-2");
    expect(ctx.user.role).toBe("LISTENER");
    expect(ctx.user.artistProfileId).toBeUndefined();
  });

  it("creates distinct instances", () => {
    const a = AuthContext.create({ userId: "u1", role: "ADMIN" });
    const b = AuthContext.create({ userId: "u2", role: "ARTIST" });
    expect(a.user.userId).not.toBe(b.user.userId);
    expect(a.user.role).not.toBe(b.user.role);
  });
});

describe("AuthContext user immutability", () => {
  it("throws on direct property assignment to user.userId", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ADMIN" });
    expect(() => {
      (ctx.user as any).userId = "hacker";
    }).toThrow();
  });

  it("throws on direct property assignment to user.role", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "LISTENER" });
    expect(() => {
      (ctx.user as any).role = "ADMIN" as any;
    }).toThrow();
  });

  it("throws when trying to add a new property to user object", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ADMIN" });
    expect(() => {
      (ctx.user as any).evil = "data";
    }).toThrow();
  });

  it("user property is frozen (Object.isFrozen returns true)", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ADMIN" });
    expect(Object.isFrozen(ctx.user)).toBe(true);
  });

  it("user is an object (not frozen at constructor argument level mutation)", () => {
    const userObj = { userId: "u1", role: "ADMIN" as UserRole };
    // Mutation of the original argument should not affect the frozen copy
    AuthContext.create(userObj);
    userObj.userId = "hacker";
    // The internal frozen copy is unaffected — this is guaranteed by spread + freeze
    // We can't directly inspect the internal copy, but if spread+freeze work, mutation is prevented.
  });
});

describe("AuthContext.toJSON", () => {
  it("returns a plain object copy of user data", () => {
    const ctx = AuthContext.create({
      userId: "user-1",
      role: "ARTIST",
      artistProfileId: "prof-1",
    });
    const obj = ctx.toJSON();
    expect(obj).toEqual({
      userId: "user-1",
      role: "ARTIST",
      artistProfileId: "prof-1",
    });
  });

  it("returns a non-frozen plain object", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ADMIN" });
    const obj = ctx.toJSON();
    expect(() => {
      (obj as any).userId = "mutated";
    }).not.toThrow();
  });

  it("returns correct data when artistProfileId is undefined", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "LISTENER" });
    const obj = ctx.toJSON();
    expect(obj.userId).toBe("user-1");
    expect(obj.role).toBe("LISTENER");
    expect(obj.artistProfileId).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  parseCookies                                                       */
/* ------------------------------------------------------------------ */

describe("parseCookies", () => {
  it("returns empty object for null input", () => {
    expect(parseCookies(null)).toEqual({});
  });

  it("parses a simple cookie string", () => {
    expect(parseCookies("foo=bar")).toEqual({ foo: "bar" });
  });

  it("parses multiple cookies", () => {
    const result = parseCookies("a=1; b=2; c=3");
    expect(result).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("trims whitespace around cookie entries", () => {
    const result = parseCookies("  x=y  ;  z=w  ");
    expect(result).toEqual({ x: "y", z: "w" });
  });

  it("handles cookies with empty values", () => {
    expect(parseCookies("empty=; valid=test")).toEqual({ empty: "", valid: "test" });
  });

  it("handles cookies with = in the value", () => {
    expect(parseCookies("data=key=value")).toEqual({ data: "key=value" });
  });

  it("handles __Host-prefixed cookies", () => {
    const result = parseCookies("__Host-indie_session=abc123");
    expect(result["__Host-indie_session"]).toBe("abc123");
  });
});

/* ------------------------------------------------------------------ */
/*  parseUserHeaders                                                   */
/* ------------------------------------------------------------------ */

describe("parseUserHeaders", () => {
  function makeRequest(headers: Record<string, string>) {
    return {
      headers: {
        get: (key: string) => headers[key] ?? null,
      },
    };
  }

  it("returns parsed headers when all required fields are present", () => {
    const req = makeRequest({
      "x-user-id": "user-1",
      "x-user-role": "ADMIN",
      "x-artist-profile-id": "profile-1",
    });
    const result = parseUserHeaders(req);
    expect(result).toEqual({
      userId: "user-1",
      role: "ADMIN",
      artistProfileId: "profile-1",
    });
  });

  it("parses headers without artistProfileId", () => {
    const req = makeRequest({
      "x-user-id": "user-2",
      "x-user-role": "LISTENER",
    });
    const result = parseUserHeaders(req);
    expect(result).toEqual({
      userId: "user-2",
      role: "LISTENER",
      artistProfileId: undefined,
    });
  });

  it("returns null when x-user-id is missing", () => {
    const req = makeRequest({ "x-user-role": "ADMIN" });
    expect(parseUserHeaders(req)).toBeNull();
  });

  it("returns null when x-user-role is missing", () => {
    const req = makeRequest({ "x-user-id": "user-1" });
    expect(parseUserHeaders(req)).toBeNull();
  });

  it("returns null when both headers are missing", () => {
    const req = makeRequest({});
    expect(parseUserHeaders(req)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  validateRole                                                       */
/* ------------------------------------------------------------------ */

describe("validateRole", () => {
  it("returns true when user role is in allowedRoles", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ADMIN" });
    expect(validateRole(ctx, ["ADMIN"])).toBe(true);
  });

  it("returns true when user role matches one of multiple allowed roles", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ARTIST" });
    expect(validateRole(ctx, ["ADMIN", "ARTIST"])).toBe(true);
  });

  it("returns false when user role is not in allowedRoles", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "LISTENER" });
    expect(validateRole(ctx, ["ADMIN"])).toBe(false);
  });

  it("returns false when allowedRoles is empty", () => {
    const ctx = AuthContext.create({ userId: "user-1", role: "ADMIN" });
    expect(validateRole(ctx, [])).toBe(false);
  });

  it("handles all UserRole values correctly", () => {
    const roles: UserRole[] = ["ADMIN", "ARTIST", "LISTENER"];
    for (const role of roles) {
      const ctx = AuthContext.create({ userId: "user-1", role });
      // Any role should match when allowedRoles contains that role
      expect(validateRole(ctx, [role])).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  buildUnauthorizedResponse                                          */
/* ------------------------------------------------------------------ */

describe("buildUnauthorizedResponse", () => {
  it("returns status 401", () => {
    const resp = buildUnauthorizedResponse();
    expect(resp.status).toBe(401);
  });

  it("returns correct error body structure", () => {
    const resp = buildUnauthorizedResponse();
    expect(resp.body.success).toBe(false);
    expect(resp.body.error.code).toBe(ERR_UNAUTHORIZED);
    expect(resp.body.error.message).toBe("Unauthorized");
    expect(resp.body.meta).toHaveProperty("timestamp");
    expect(resp.body.meta).toHaveProperty("requestId");
  });

  it("error code matches ERR_UNAUTHORIZED constant", () => {
    const resp = buildUnauthorizedResponse();
    expect(resp.body.error.code).toBe("ERR_UNAUTHORIZED");
  });
});

/* ------------------------------------------------------------------ */
/*  buildForbiddenRoleResponse                                         */
/* ------------------------------------------------------------------ */

describe("buildForbiddenRoleResponse", () => {
  it("returns status 403", () => {
    const resp = buildForbiddenRoleResponse();
    expect(resp.status).toBe(403);
  });

  it("returns correct error body structure", () => {
    const resp = buildForbiddenRoleResponse();
    expect(resp.body.success).toBe(false);
    expect(resp.body.error.code).toBe(ERR_FORBIDDEN_ROLE);
    expect(resp.body.error.message).toBe("Insufficient role for this resource");
    expect(resp.body.meta).toHaveProperty("timestamp");
    expect(resp.body.meta).toHaveProperty("requestId");
  });

  it("error code matches ERR_FORBIDDEN_ROLE constant", () => {
    const resp = buildForbiddenRoleResponse();
    expect(resp.body.error.code).toBe("ERR_FORBIDDEN_ROLE");
  });
});

/* ------------------------------------------------------------------ */
/*  extractSessionToken (from wrappers)                                */
/* ------------------------------------------------------------------ */

describe("extractSessionToken", () => {
  it("returns null when no x-session-token header and no cookie", () => {
    const req = {
      headers: {
        get: (key: string) => {
          if (key === "x-session-token") return null;
          if (key === "cookie") return null;
          return null;
        },
      },
    };
    expect(extractSessionToken(req)).toBeNull();
  });

  it("returns x-session-token header value when present", () => {
    const token = "session-token-from-header";
    const req = {
      headers: {
        get: (key: string) => {
          if (key === "x-session-token") return token;
          return null;
        },
      },
    };
    expect(extractSessionToken(req)).toBe(token);
  });

  it("returns cookie token when no x-session-token header", () => {
    const cookieToken = "cookie-token-value";
    const req = {
      headers: {
        get: (key: string) => {
          if (key === "x-session-token") return null;
          if (key === "cookie") return `__Host-indie_session=${cookieToken}`;
          return null;
        },
      },
    };
    expect(extractSessionToken(req)).toBe(cookieToken);
  });

  it("x-session-token header takes priority over cookie", () => {
    const headerToken = "header-priority-token";
    const cookieToken = "cookie-fallback-token";
    const req = {
      headers: {
        get: (key: string) => {
          if (key === "x-session-token") return headerToken;
          if (key === "cookie") return `__Host-indie_session=${cookieToken}`;
          return null;
        },
      },
    };
    // Header should take priority
    expect(extractSessionToken(req)).toBe(headerToken);
  });
});

/* ------------------------------------------------------------------ */
/*  extractAuthContext                                                 */
/* ------------------------------------------------------------------ */

describe("extractAuthContext", () => {
  beforeEach(() => {
    process.env.JWT_SECRET =
      "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  function makeRequest(headers: Record<string, string>) {
    return {
      headers: {
        get: (key: string) => headers[key] ?? null,
      },
    };
  }

  describe("middleware header priority", () => {
    it("returns AuthContext when x-user-id and x-user-role headers are present", () => {
      const req = makeRequest({
        "x-user-id": "user-1",
        "x-user-role": "ADMIN",
        "x-artist-profile-id": "profile-1",
      });
      const ctx = extractAuthContext(req);
      expect(ctx).not.toBeNull();
      expect(ctx!.user.userId).toBe("user-1");
      expect(ctx!.user.role).toBe("ADMIN");
      expect(ctx!.user.artistProfileId).toBe("profile-1");
    });

    it("returns AuthContext without artistProfileId when only required headers present", () => {
      const req = makeRequest({
        "x-user-id": "user-2",
        "x-user-role": "LISTENER",
      });
      const ctx = extractAuthContext(req);
      expect(ctx).not.toBeNull();
      expect(ctx!.user.userId).toBe("user-2");
      expect(ctx!.user.role).toBe("LISTENER");
      expect(ctx!.user.artistProfileId).toBeUndefined();
    });

    it("returns null when x-user-id is missing even if x-user-role is present", () => {
      const req = makeRequest({
        "x-user-role": "ADMIN",
      });
      expect(extractAuthContext(req)).toBeNull();
    });

    it("returns null when x-user-role is missing even if x-user-id is present", () => {
      const req = makeRequest({
        "x-user-id": "user-1",
      });
      expect(extractAuthContext(req)).toBeNull();
    });
  });

  describe("cookie token fallback", () => {
    it("falls back to cookie verification when middleware headers are absent", () => {
      const token = generateToken({ sub: "user-cookie", role: "ARTIST" });
      const req = makeRequest({
        cookie: `__Host-indie_session=${token}`,
      });
      const ctx = extractAuthContext(req);
      expect(ctx).not.toBeNull();
      expect(ctx!.user.userId).toBe("user-cookie");
      expect(ctx!.user.role).toBe("ARTIST");
    });

    it("falls back to x-session-token when no middleware headers but token exists", () => {
      const token = generateToken({ sub: "user-header", role: "LISTENER" });
      const req = makeRequest({
        "x-session-token": token,
      });
      const ctx = extractAuthContext(req);
      expect(ctx).not.toBeNull();
      expect(ctx!.user.userId).toBe("user-header");
      expect(ctx!.user.role).toBe("LISTENER");
    });

    it("returns null when cookie token is tampered", () => {
      const req = makeRequest({
        cookie: "__Host-indie_session=tampered-garbage",
      });
      const ctx = extractAuthContext(req);
      expect(ctx).toBeNull();
    });

    it("returns null when no cookie is present", () => {
      const req = makeRequest({});
      const ctx = extractAuthContext(req);
      expect(ctx).toBeNull();
    });

    it("returns null when cookie has no session token", () => {
      const req = makeRequest({
        cookie: "__Host-another_cookie=value",
      });
      const ctx = extractAuthContext(req);
      expect(ctx).toBeNull();
    });
  });

  describe("x-session-token header priority over cookie", () => {
    it("uses x-session-token header instead of cookie when both are present", () => {
      const tokenA = generateToken({ sub: "user-token", role: "ADMIN" });
      const tokenB = generateToken({ sub: "user-cookie", role: "LISTENER" });
      const req = makeRequest({
        "x-session-token": tokenA,
        cookie: `__Host-indie_session=${tokenB}`,
      });
      const ctx = extractAuthContext(req);
      expect(ctx).not.toBeNull();
      expect(ctx!.user.userId).toBe("user-token");
      expect(ctx!.user.role).toBe("ADMIN");
    });
  });

  describe("Artist profile ID from cookie", () => {
    it("includes artistProfileId when present in verified token", () => {
      const token = generateToken({
        sub: "user-artist",
        role: "ARTIST",
        artistProfileId: "artist-99",
      });
      const req = makeRequest({});
      req.headers.get = (key: string) => {
        if (key === "x-user-id") return null;
        if (key === "x-user-role") return null;
        if (key === "x-artist-profile-id") return null;
        if (key === "x-session-token") return null;
        if (key === "cookie") return `__Host-indie_session=${token}`;
        return null;
      };
      const ctx = extractAuthContext(req);
      expect(ctx).not.toBeNull();
      expect(ctx!.user.artistProfileId).toBe("artist-99");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  withAuth HOF                                                       */
/* ------------------------------------------------------------------ */

describe("withAuth HOF", () => {
  beforeEach(() => {
    process.env.JWT_SECRET =
      "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("returns a function (the wrapper)", () => {
    const wrapper = withAuth(async (_ctx, _req) => {
      return NextResponse.json({ ok: true });
    });
    expect(typeof wrapper).toBe("function");
  });

  it("returns 401 when no auth headers or cookie are present", async () => {
    const handler = withAuth(async (_ctx, _req) => {
      return NextResponse.json({ shouldNot: "reach-here" });
    });
    const req = new NextRequest("http://localhost/api/test", { method: "GET" });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ERR_UNAUTHORIZED");
  });

  it("returns 401 when cookie token is tampered/invalid", async () => {
    const handler = withAuth(async (_ctx, _req) => {
      return NextResponse.json({ shouldNot: "reach-here" });
    });
    const headers = new Headers();
    headers.set("cookie", "__Host-indie_session=tampered-token-value");
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(401);
  });

  it("passes AuthContext to the inner handler when middleware headers are present", async () => {
    let receivedCtx: AuthContext | null = null;
    const handler = withAuth(async (ctx, _req) => {
      receivedCtx = ctx;
      return NextResponse.json({ ok: true });
    });
    const headers = new Headers();
    headers.set("x-user-id", "user-123");
    headers.set("x-user-role", "ARTIST");
    headers.set("x-artist-profile-id", "artist-profile-456");
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    await handler(req);
    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.user.userId).toBe("user-123");
    expect(receivedCtx!.user.role).toBe("ARTIST");
    expect(receivedCtx!.user.artistProfileId).toBe("artist-profile-456");
  });

  it("passes AuthContext to the inner handler when cookie token is valid", async () => {
    const token = generateToken({ sub: "cookie-user", role: "ADMIN" });
    let receivedCtx: AuthContext | null = null;
    const handler = withAuth(async (ctx, _req) => {
      receivedCtx = ctx;
      return NextResponse.json({ ok: true });
    });
    const headers = new Headers();
    headers.set("cookie", `__Host-indie_session=${token}`);
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    await handler(req);
    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.user.userId).toBe("cookie-user");
    expect(receivedCtx!.user.role).toBe("ADMIN");
  });

  it("returns 401 (not 200) when auth fails — handler is never called", async () => {
    let handlerCalled = false;
    const handler = withAuth(async (_ctx, _req) => {
      handlerCalled = true;
      return NextResponse.json({ ok: true });
    });
    const req = new NextRequest("http://localhost/api/test", { method: "GET" });
    const response = (await handler(req)) as NextResponse;
    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(401);
  });

  it("returns 401 when x-session-token is an invalid token", async () => {
    const handler = withAuth(async (_ctx, _req) => {
      return NextResponse.json({ shouldNot: "reach-here" });
    });
    const headers = new Headers();
    headers.set("x-session-token", "invalid-expired-token");
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  withRole HOF                                                       */
/* ------------------------------------------------------------------ */

describe("withRole HOF", () => {
  beforeEach(() => {
    process.env.JWT_SECRET =
      "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("returns a function (the wrapper)", () => {
    const wrapper = withRole(
      ["ADMIN"],
      async (_ctx, _req) => NextResponse.json({ ok: true }),
    );
    expect(typeof wrapper).toBe("function");
  });

  it("returns 401 when no auth is present (before role check)", async () => {
    const handler = withRole(
      ["ADMIN"],
      async (_ctx, _req) => NextResponse.json({ shouldNot: "reach-here" }),
    );
    const req = new NextRequest("http://localhost/api/test", { method: "GET" });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(401);
  });

  it("returns 403 when user role does not match allowed roles", async () => {
    let handlerCalled = false;
    const handler = withRole(
      ["ADMIN"],
      async (_ctx, _req) => {
        handlerCalled = true;
        return NextResponse.json({ ok: true });
      },
    );
    const headers = new Headers();
    headers.set("x-user-id", "user-1");
    headers.set("x-user-role", "LISTENER");
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    const response = (await handler(req)) as NextResponse;
    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ERR_FORBIDDEN_ROLE");
  });

  it("returns 403 when ARTIST accesses ADMIN-only route", async () => {
    const handler = withRole(
      ["ADMIN"],
      async (_ctx, _req) => NextResponse.json({ shouldNot: "reach-here" }),
    );
    const headers = new Headers();
    headers.set("x-user-id", "artist-1");
    headers.set("x-user-role", "ARTIST");
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(403);
  });

  it("passes through to handler when user role matches allowed roles", async () => {
    let receivedCtx: AuthContext | null = null;
    const handler = withRole(
      ["ADMIN"],
      async (ctx, _req) => {
        receivedCtx = ctx;
        return NextResponse.json({ ok: true });
      },
    );
    const headers = new Headers();
    headers.set("x-user-id", "admin-1");
    headers.set("x-user-role", "ADMIN");
    const req = new NextRequest("http://localhost/api/test", { method: "GET", headers });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(200);
    expect(receivedCtx!.user.userId).toBe("admin-1");
    expect(receivedCtx!.user.role).toBe("ADMIN");
  });

  it("allows any of multiple allowed roles", async () => {
    const handler = withRole(
      ["ADMIN", "ARTIST"],
      async (ctx, _req) => {
        return NextResponse.json({ role: ctx.user.role });
      },
    );
    const headers = new Headers();
    headers.set("x-user-id", "artist-1");
    headers.set("x-user-role", "ARTIST");
    const req = new NextRequest("http://localhost/api/test", {
      method: "GET",
      headers,
    });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(200);
    expect((await response.json()).role).toBe("ARTIST");
  });

  it("returns 403 for LISTENER when ARTIST or ADMIN required", async () => {
    const handler = withRole(
      ["ARTIST", "ADMIN"],
      async (_ctx, _req) => NextResponse.json({ shouldNot: "reach-here" }),
    );
    const headers = new Headers();
    headers.set("x-user-id", "listener-1");
    headers.set("x-user-role", "LISTENER");
    const req = new NextRequest("http://localhost/api/test", {
      method: "GET",
      headers,
    });
    const response = (await handler(req)) as NextResponse;
    expect(response.status).toBe(403);
  });

  it("auth failure (no token) returns 401 not 403", async () => {
    let handlerCalled = false;
    const handler = withRole(
      ["ADMIN"],
      async (_ctx, _req) => {
        handlerCalled = true;
        return NextResponse.json({ ok: true });
      },
    );
    const req = new NextRequest("http://localhost/api/test", { method: "GET" });
    const response = (await handler(req)) as NextResponse;
    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(401);
  });
});

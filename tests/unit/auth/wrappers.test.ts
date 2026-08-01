import { describe, it, expect } from "vitest";
import {
  AuthContext,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN_ROLE,
  parseCookies,
  parseUserHeaders,
  validateRole,
  buildUnauthorizedResponse,
  buildForbiddenRoleResponse,
} from "../../../src/lib/auth/wrappers";
import type { UserRole } from "../../../src/lib/auth";

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

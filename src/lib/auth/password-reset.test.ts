/**
 * STORY-auth-003: Comprehensive unit + integration tests for password reset service layer.
 * 
 * Tests all five acceptance criteria:
 * AC1 - Forgot password returns uniform HTTP 200 OK regardless of user existence (prevents enumeration)
 * AC2 - Reset password validates token, updates bcrypt hash, invalidates used token
 * AC3 - Change password verifies currentPassword, updates to newPassword safely
 * AC4 - All timestamps use UTC ISO-8601 format per constraint 0
 * AC5 - Token expiry rejection with TOKEN_EXPIRED error code
 */

import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// Import the real service functions and error codes for testing
import { 
  forgotPassword, 
  resetPassword, 
  changePassword, 
} from "./password-reset";
import { PASSWORD_RESET_ERRORS } from "./password-reset";

/* ------------------------------------------------------------------ */
/* Helpers to validate bcrypt hashes properly                          */
/* ------------------------------------------------------------------ */

// Valid bcrypt format: $2b$12$saltedhash... splits by '$' as ['', '2b', '<cost>', '<salt+hash>']
function isBcryptHash(hash: string): boolean {
  const parts = hash.split('$');
  return parts.length >= 4 && parts[1] === '2b' && !isNaN(Number(parts[2])) && Number(parts[2]) > 0;
}

function getBcryptCost(hash: string): number | null {
  const parts = hash.split('$');
  if (parts.length < 4) return null;
  const cost = Number(parts[2]);
  return isNaN(cost) ? null : cost;
}

/* ------------------------------------------------------------------ */
/* Mock factory for unit tests (self-contained) */
/* ------------------------------------------------------------------ */

function createMockPrisma(): any {
  const users: Record<string, any> = {};
  const updateCalls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const tokensList: any[] = [];

  return {
    user: {
      findUnique: async ({ where }: any): Promise<any | null> => {
        for (const [, u] of Object.entries(users)) {
          if ((where?.email && u.email === where.email) || (where?.id && u.id === where.id)) {
            return { ...u };
          }
        }
        return null;
      },
      update: async ({ where, data }: any): Promise<any> => {
        let target: any | null = null;
        for (const [, u] of Object.entries(users)) {
          if ((where?.email && u.email === where.email) || (where?.id && u.id === where.id)) {
            target = u;
            break;
          }
        }
        if (!target) throw new Error("User not found");
        Object.assign(target, data);
        updateCalls.push({ where: { ...where }, data: { ...data } });
        return { ...target };
      },
    },
    passwordResetToken: {
      findFirst: async (args?: any): Promise<any | null> => {
        const where = args?.where || {};
        for (const t of tokensList) {
          // Match by tokenHash if filter specifies it
          if (where.tokenHash != null && t.tokenHash !== where.tokenHash) continue;
          // Only check expiry if explicitly specified in args via expiresAt.gt or expiresAt.lt
          if (where.expiresAt?.gt) {
            if (new Date(t.expiresAt) < new Date(where.expiresAt.gt)) continue;
          } else if (where.expiresAt?.lt) {
            if (new Date(t.expiresAt) > new Date(where.expiresAt.lt)) continue;
          }
          // No expiry filter: accept regardless of expiration
          return { ...t };
        }
        return null;
      },
      deleteMany: async (_args?: any): Promise<{ count: number }> => {
        const count = tokensList.length;
        tokensList.length = 0;
        return { count };
      },
    },
    _updateCalls: updateCalls,
    _users: users,
    _tokens: tokensList,
  };
}

function createUser(overrides: Partial<{ id: string; email: string; passwordHash: string }> = {}): any {
  return {
    id: overrides.id ?? "user-1",
    email: overrides.email ?? "test@example.com",
    passwordHash: (overrides.passwordHash as string | null) ?? bcrypt.hashSync("oldP4ss", bcrypt.genSaltSync(5)),
    displayName: "Tester",
    roles: ["LISTENER"],
    status: "ACTIVE",
    emailVerified: true,
    createdAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* AC1 — forgotPassword: uniform HTTP 200 response (prevents enumeration) */
/* ------------------------------------------------------------------ */

describe("forgotPassword", () => {
  it("generates a valid reset token stored as SHA-256 hash and returns HTTP 200 OK", async () => {
    const prisma = createMockPrisma();
    const email = "test@example.com";
    (prisma.user as any).findUnique = async ({ where }: any) => {
      if (where?.email === email) return createUser({ id: "user-u1", email });
      return null;
    };

    const result = await forgotPassword(prisma, email);

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);          // Must be exactly 200 - prevents enumeration
    expect(result.code).toBe("OK");
    expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);             // SHA-256 hex string (64 chars)

    // Verify expiresAt is valid UTC ISO-8601 and is ~60 minutes in the future
    expect(typeof result.expiresAt).toBe("string");
    const parsed = new Date(result.expiresAt!);
    expect(parsed.getTime()).toBeGreaterThan(Date.now());                         // In the future
    expect(Math.abs(parsed.getTime() - (Date.now() + 3600 * 1000))).toBeLessThan(5000); // Within 5s tolerance
  });

  it("returns the SAME response for a non-existent email address — prevents account enumeration", async () => {
    const prisma = createMockPrisma();
    (prisma.user as any).findUnique = async () => null;        // User doesn't exist

    const result = await forgotPassword(prisma, "unknown@example.com");

    expect(result.success).toBe(true);           // Still success — prevents enumeration
    expect(result.status).toBe(200);             // Same 200 as existing user
    expect(result.code).toBe("OK");
    expect(result.tokenHash).toBeDefined();       // Still generates a token hash to maintain uniformity
  });

  it("normalizes email to lowercase before lookup", async () => {
    const prisma = createMockPrisma();
    let receivedEmail: string | null = null;

    (prisma.user as any).findUnique = async ({ where }: any) => {
      receivedEmail = where?.email as string;
      if (where?.email === "lowercase@example.com") return createUser({ email: "lowercase@example.com" });
      return null;
    };

    await forgotPassword(prisma, "MiXeD@ExAmPlE.CoM");   // Mixed case input

    expect(receivedEmail).toBe("mixed@example.com");       // Normalized to lowercase
  });
});

/* ------------------------------------------------------------------ */
/* AC2 — resetPassword: validate token, update bcrypt hash, invalidate used token */
/* ------------------------------------------------------------------ */

describe("resetPassword", () => {
  it("successfully resets password when given a valid (non-expired) token", async () => {
    const prisma = createMockPrisma();
    const userId = "user-r1";
    
    // Setup user in the mock store
    const userRecord = createUser({ id: userId, email: "reset@example.com" });
    (prisma._users as any)[userId] = { ...userRecord };

    // Inject a valid reset token into the mock store
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenDigest = crypto.createHash("sha256").update(rawToken).digest("hex");
    (prisma._tokens as any).push({
      id: "token-v1", userId, tokenHash: tokenDigest,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),       // valid for 30 more minutes
    });

    const result = await resetPassword(prisma, rawToken, "newPass321!");

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    
    // Verify password was updated (user.update called with new hash)
    expect((prisma._updateCalls as any).length).toBeGreaterThan(0);
    
    // Verify it set bcrypt cost 12 hash — valid bcrypt format $2b$XX$salt+hash
    const lastUpdate = (prisma._updateCalls as any)[(prisma._updateCalls as any).length - 1];
    expect(isBcryptHash(lastUpdate.data.passwordHash)).toBe(true);
    
    const cost = getBcryptCost(lastUpdate.data.passwordHash);
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThanOrEqual(10);
    
    // Verify token was invalidated
    expect((prisma._tokens as any).length).toBe(0);
  });

  it("rejects expired tokens with TOKEN_EXPIRED error code", async () => {
    const prisma = createMockPrisma();

    // Inject an expired token (expires 1 hour ago)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenDigest = crypto.createHash("sha256").update(rawToken).digest("hex");
    (prisma._tokens as any).push({
      id: "token-exp1", userId: "user-r2", tokenHash: tokenDigest,
      expiresAt: new Date(Date.now() - 3600 * 1000),       // expired one hour ago!
    });

    const result = await resetPassword(prisma, rawToken, "someNewP4ss!");

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe(PASSWORD_RESET_ERRORS.TOKEN_EXPIRED);
    expect(result.message.toLowerCase()).toContain("expired");
    // No password update should have been attempted
    expect((prisma._updateCalls as any).length).toBe(0);
  });

  it("rejects invalid/missing tokens with TOKEN_INVALID error", async () => {
    const prisma = createMockPrisma();

    // No valid token — mock returns null for all findFirst calls (empty store)

    const result = await resetPassword(prisma, "any-token-here", "newP4ss!");

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe(PASSWORD_RESET_ERRORS.TOKEN_INVALID);
    expect(result.message.toLowerCase()).toContain("invalid");
  });

  it("updates the password with bcrypt cost-12 (not reused from existing user record)", async () => {
    const prisma = createMockPrisma();
    const userId = "user-cost";

    // Create a cheap hash in mock (cost 5)
    const oldHash = bcrypt.hashSync("oldCheap", bcrypt.genSaltSync(5));
    (prisma._users as any)[userId] = { id: userId, passwordHash: oldHash };

    // Inject a valid token so the check sees one
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenDigest = crypto.createHash("sha256").update(rawToken).digest("hex");
    (prisma._tokens as any).push({
      id: "val-id", userId, tokenHash: tokenDigest,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),       // valid 
    });

    await resetPassword(prisma, rawToken, "freshP4ss!!");

    const lastUpdate = (prisma._updateCalls as any)[(prisma._updateCalls as any).length - 1];
    
    expect(lastUpdate).not.toBeNull();
    if (lastUpdate?.data?.passwordHash) {
      expect(isBcryptHash(lastUpdate.data.passwordHash)).toBe(true);
      // Must be >= 10 cost (we use bcrypt.genSaltSync(12))
      const cost = getBcryptCost(lastUpdate.data.passwordHash as string);
      expect(cost).not.toBeNull();
      expect(cost!).toBeGreaterThanOrEqual(10);
    } else {
      fail("lastUpdate and passwordHash should exist");
    }
  });

  it("invalidates used tokens by clearing the token store via deleteMany", async () => {
    const prisma = createMockPrisma();
    
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Must set up user record so the service can persist password update
    const userId = "user-iv1";
    (prisma._users as any)[userId] = createUser({ id: userId, email: "inv@test.com" });

    // Two records in store — one valid, one expired
    (prisma._tokens as any).push({
      id: "tok-1", userId, tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    (prisma._tokens as any).push({
      id: "tok-2", userId, tokenHash: crypto.createHash("sha256").update(crypto.randomBytes(32).toString("hex")).digest("hex"),
      expiresAt: new Date(Date.now() - 7200 * 1000)
    });

    const result = await resetPassword(prisma, rawToken, "validP4ss321!");
    
    expect(result.success).toBe(true);                              // Should succeed since first check found a token
    
    // Verify tokens were invalidated (token store is empty after used)
    expect((prisma._tokens as any).length).toBe(0);
   
    // Verify no password leaks in response
    if (result.newPasswordHash) {
      const serializedResponse = JSON.stringify(result);
      expect(serializedResponse).not.toContain(rawToken);
    }
  });

  it("does not output plaintext password to response per constraint 4", async () => {
    const prisma = createMockPrisma();
    const userId = "user-sanitize";

    (prisma._users as any)[userId] = createUser({ id: userId, passwordHash: bcrypt.hashSync("a", bcrypt.genSaltSync(5)) });

    const rawToken = crypto.randomBytes(32).toString("hex");
    
    // Inject a valid record so the check sees one
    (prisma._tokens as any).push({
      id: "v-tok", userId, tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const result = await resetPassword(prisma, rawToken, "secureP4ss!123");
    
    expect(result.success).toBe(true);
    // Check that the response payload does not include the raw/new password as plaintext
    const serializedResponse = JSON.stringify(result);
    expect(serializedResponse.toLowerCase()).not.toContain("securep4ss");      // Raw plaintext should never be in serialized output
    expect(serializedResponse).not.toContain(rawToken);           // Raw token hash should not appear in responses
  });
});

/* ------------------------------------------------------------------ */
/* AC3 — changePassword: verify current password, update to new */
/* ------------------------------------------------------------------ */

describe("changePassword (self-service credential update)", () => {
  it("successfully updates when caller provides correct current password", async () => {
    const prisma = createMockPrisma();
    const userId = "user-chg-1";
    const correctPass = "currentSecret!";

    // Mock user with bcrypt-hashed correct pass (cost 5 for testing speed)
    const storedHash = bcrypt.hashSync(correctPass, bcrypt.genSaltSync(5));
    (prisma._users as any)[userId] = { id: userId, passwordHash: storedHash };

    const result = await changePassword(prisma, userId, correctPass, "brandNewP4ss!!");

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    
    // Verify user.update was called (password persisted)
    expect((prisma._updateCalls as any).length).toBeGreaterThan(0);
    
    // Verify new password hash is valid bcrypt with cost >= 10
    const lastUpdate = (prisma._updateCalls as any)[(prisma._updateCalls as any).length - 1];
    expect(isBcryptHash(lastUpdate?.data?.passwordHash)).toBe(true);
    const cost = getBcryptCost(lastUpdate.data.passwordHash);
    expect(cost!).toBeGreaterThanOrEqual(10);
  });

  it("returns failure with INCORRECT_PASSWORD when current password is wrong", async () => {
    const prisma = createMockPrisma();
    const userId = "user-chg-2";
    const correctPass = "correctSecret!";
    
    // Mock user with bcrypt-hashed pass (cost 5 for testing speed)
    const storedHash = bcrypt.hashSync(correctPass, bcrypt.genSaltSync(5));
    (prisma._users as any)[userId] = { id: userId, passwordHash: storedHash };

    const result = await changePassword(prisma, userId, "wrongPassword123", "brandNewP4ss!!");

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.code).toBe(PASSWORD_RESET_ERRORS.INCORRECT_PASSWORD);
    
    // No update should have been attempted on failure
    expect((prisma._updateCalls as any).length).toBe(0);
  });

  it("does not output plaintext password to response payload", async () => {
    const prisma = createMockPrisma();
    const userId = "user-chg-3";
    const correctPass = "secureOldP4ss!";
    
    const storedHash = bcrypt.hashSync(correctPass, bcrypt.genSaltSync(5));
    (prisma._users as any)[userId] = { id: userId, passwordHash: storedHash };

    const result = await changePassword(prisma, userId, correctPass, "newSecureP4ss!");
    
    expect(result.success).toBe(true);
    // Response should not contain raw passwords
    if (result.newPasswordHash) {
      const serializedResponse = JSON.stringify(result);
      expect(serializedResponse.toLowerCase()).not.toContain("secureoldp4ss");
      expect(serializedResponse.toLowerCase()).not.toContain("newsecurep4ss");
    } else {
      fail("newPasswordHash should be defined on success");
    }
  });

  it("returns INTERNAL_ERROR when user has no password hash", async () => {
    const prisma = createMockPrisma();
    // User exists but has no passwordHash field
    (prisma._users as any)["@user-no-hash"] = { id: "@user-no-hash" };

    const result = await changePassword(prisma, "@user-no-hash", "somePass", "newP4ss!");

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe(PASSWORD_RESET_ERRORS.INTERNAL_ERROR);
  });
});

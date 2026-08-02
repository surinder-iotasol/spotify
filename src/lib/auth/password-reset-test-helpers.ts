/**
 * Test helpers for password reset service — mock Prisma client builder.
 */

export interface MockUserRecord {
  id: string;
  email: string;
  displayName?: string;
  passwordHash?: string;
}

export interface MockResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date | string;
}

/** Create a minimal mock Prisma client for unit testing the password reset service. */
export function createMockPrisma(): any {
  const users = new Map<string, MockUserRecord>();
  const tokens = new Map<string, MockResetTokenRecord>();

  return {
    user: {
      findUnique: async (args?: any): Promise<MockUserRecord | null> => {
        const where = args?.where;
        if (!where) return null;
        for (const u of users.values()) {
          if ((where.email && u.email === where.email) || (where.id && u.id === where.id)) return { ...u };
        }
        return null;
      },
      update: async ({ where, data }: any): Promise<MockUserRecord> => {
        let target: MockUserRecord | undefined;
        for (const u of users.values()) {
          if ((where.email && u.email === where.email) || (where.id && u.id === where.id)) target = u;
        }
        if (!target) throw new Error("User not found");
        Object.assign(target, data);
        return { ...target };
      },
    },
    passwordResetToken: {
      findFirst: async (): Promise<MockResetTokenRecord | null> => {
        let earliest: MockResetTokenRecord | undefined;
        const now = new Date();
        for (const t of tokens.values()) {
          const exp = new Date(t.expiresAt);
          if (exp > now) {
            if (!earliest || exp < new Date(earliest.expiresAt)) earliest = t;
          }
        }
        return earliest ?? null;
      },
      deleteMany: async (): Promise<{ count: number }> => {
        const count = tokens.size;
        tokens.clear();
        return { count };
      },
    },
  };
}

/** Generate a random token and its SHA-256 hash for testing. */
export function generateTokenHash(): { tok: string; hash: string } {
  const crypto = require("node:crypto");
  const rawBytes = crypto.randomBytes(32).toString("hex");
  return { tok: rawBytes, hash: crypto.createHash("sha256").update(rawBytes).digest("hex") };
}

/** Inject a valid reset token record into the mock (non-expired). */
export function injectValidToken(mock: any, userId: string, expiresMinutes = 60): { tok: string; hash: string } {
  const crypto = require("node:crypto");
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const h = crypto.createHash("sha256").update(rawBytes).digest("hex");
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  const mockRecord: MockResetTokenRecord = { id: "tk-mock", userId, tokenHash: h, expiresAt };
  (mock.passwordResetToken as any)._store.set(mockRecord.id, mockRecord);

  return { tok: rawBytes, hash: h };
}

/** Inject an expired reset token record into the mock. */
export function injectExpiredToken(mock: any, userId: string): { tok: string; hash: string } {
  const crypto = require("node:crypto");
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const h = crypto.createHash("sha256").update(rawBytes).digest("hex");
  const expiresAt = new Date(Date.now() - 3600 * 1000); // expired 1 hour ago

  const mockRecord: MockResetTokenRecord = { id: "tk-expired", userId, tokenHash: h, expiresAt };
  (mock.passwordResetToken as any)._store!.set(mockRecord.id, mockRecord);

  return { tok: rawBytes, hash: h };
}

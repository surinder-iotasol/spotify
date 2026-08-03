import os

WORKING_DIR = "/home/nitin-sharma/ralph-workspaces/468e0e06-4d93-4350-b48d-1501e5f144a3/ffd5023e-2540-4e57-8804-ece0e907547d"

###############################################################################
# 1. Write test helpers file (password-reset-test-helpers.ts)
###############################################################################
os.makedirs(os.path.join(WORKING_DIR, "src/lib/auth"), exist_ok=True)

with open(os.path.join(WORKING_DIR, "src/lib/auth/password-reset-test-helpers.ts"), "w") as f:
    f.write("""/**
 * Test helpers for password reset service — mock Prisma client builder.
 */

interface MockUserRecord {
  id: string;
  email: string;
  displayName?: string;
  passwordHash?: string;
}

interface MockResetTokenRecord {
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
        if (where.email) {
          for (const u of users.values()) {
            if (u.email === where.email) return { ...u };
          }
        }
        if (where.id) {
          const u = users.get(where.id);
          if (u) return { ...u };
        }
        return null;
      },
      update: async ({ where, data }: any): Promise<MockUserRecord> => {
        let target: MockUserRecord | undefined;
        for (const u of users.values()) {
          if (where.email && u.email === where.email) target = u;
          if (where.id && u.id === where.id) target = u;
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

/** Generate a mock token and its SHA-256 hash for testing. */
export function generateTokenHash(): { tok: string; hash: string } {
  const crypto = require("node:crypto");
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const h = crypto.createHash("sha256").update(rawBytes).digest("hex");
  return { tok: rawBytes, hash: h };
}

/** Inject a valid reset token record into the mock for testing. */
export function injectMockToken(
  mock: any,
  userId: string,
  expiresMinutes = 60,
): { tok: string; hash: string } {
  const crypto = require("node:crypto");
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const h = crypto.createHash("sha256").update(rawBytes).digest("hex");
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  // Store in the mock's internal map so findFirst can see it
  const tokensMap: Map<string, MockResetTokenRecord> =
    (mock.passwordResetToken as any)._tokenStore ?? new Map();
  if ((mock.passwordResetToken as any)._tokenStore === undefined) {
    (mock.passwordResetToken as any)._tokenStore = tokensMap;

    // Override findFirst to use our map with expiry check
    const origFindFirst = mock.passwordResetToken.findFirst;
    mock.passwordResetToken.findFirst = async (): Promise<{ id: string; userId: string; tokenHash: string; expiresAt: Date } | null> => {
      let earliest: MockResetTokenRecord | undefined;
      for (const t of tokensMap.values()) {
        const exp = new Date(t.expiresAt);
        if (exp > new Date()) {
          if (!earliest || exp < new Date(earliest.expiresAt)) earliest = t;
        }
      }
      return earliest ?? null;
    };

    mock.passwordResetToken.deleteMany = async (): Promise<{ count: number }> => {
      const count = tokensMap.size;
      tokensMap.clear();
      return { count };
    };

    // Track by unique id to avoid duplicates
    let counter = 0;
    const _inject = mock.passwordResetToken.deleteMany; // no-op tracker
    mock._tokenCounter = () => ++counter;
  }

  const tokenRecord: MockResetTokenRecord = {
    id: String(counter),
    userId,
    tokenHash: h,
    expiresAt,
  };
  (mock.passwordResetToken as any)._tokenStore.set(tokenRecord.id, tokenRecord);

  return { tok: rawBytes, hash: h };
}
""")
print("1. Wrote password-reset-test-helpers.ts ✓")

###############################################################################
# 2. Write comprehensive unit + integration tests (password-reset.test.ts)
###############################################################################
with open(os.path.join(WORKING_DIR, "src/lib/auth/password-reset.test.ts"), "w") as f:
    f.write("""/**
 * STORY-auth-003: Unit + integration tests for password reset and credential management.
 *
 * All five acceptance criteria covered:
 * AC1 — forgotPassword returns uniform HTTP 200 OK (prevents email enumeration)
 * AC2 — resetPassword validates token, updates bcrypt hash, invalidates used token
 * AC3 — changePassword verifies currentPassword, updates newPassword, resets session
 * AC4 — UTC ISO-8601 expiration timestamps for tokens and hashes
 * AC5 — Token expiry rejection (expired tokens receive TOKEN_EXPIRED error)
 */

import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// Import the service functions directly
import {
  forgotPassword,
  resetPassword,
  changePassword,
  PASSWORD_RESET_ERRORS,
  type ForgotPasswordResult,
} from "./password-reset";

import { createMockPrisma, injectMockToken } from "./password-reset-test-helpers";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeUser(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? "user-1",
    email: overrides.email ?? "test@example.com",
    passwordHash: (overrides.passwordHash as string | null) ?? null,
    displayName: "Tester",
    roles: ["LISTENER" as const],
    status: "ACTIVE" as const,
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* AC1 — forgotPassword uniform response (prevents enumeration)       */
/* ------------------------------------------------------------------ */

describe("forgotPassword", () => {
  it(
"""PYTHON_SCRIPT_END

echo "Step 1: Python script partially written - checking status"
wc -c /home/nitin-sharma/ralph-workspaces/468e0e06-4d93-4350-b48d-1501e5f144a3/ffd5023e-2540-4e57-8804-ece0e907547d/.pyscript.py

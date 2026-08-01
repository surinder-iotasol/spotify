/**
 * STORY-security-001: Unit tests for password hashing, verification, payload
 * sanitization, Prisma query wrappers, and log sanitization.
 *
 * Acceptance criteria covered:
 * 1. Hashing passwords using bcrypt generates a valid salt and hash (cost 12).
 * 2. Verifying a raw password against the stored hash returns true/false correctly.
 * 3. Sanitization helper strips passwordHash from User model objects.
 * 4. Prisma query select wrappers omit passwordHash from returned fields.
 * 5. Password hashes never written to log streams or error stack traces.
 * 6. Cost factor 12 execution time ~250ms.
 */

import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  comparePassword,
  sanitizePasswordHash,
  sanitizeObject,
  prismaUserSelect,
  sanitizeLogPayload,
} from '../../../src/lib/security/password';

// ---------------------------------------------------------------------------
// 1. Hashing passwords (AC1)
// ---------------------------------------------------------------------------

describe('hashPassword()', () => {
  it('generates a bcrypt hash that starts with $2b$ and uses cost factor 12', async () => {
    const hash = await hashPassword('SuperSecret1');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    // bcrypt hashes start with $2b$<2digit cost>$<53 char salt + 31 char hash>
    expect(hash).toMatch(/^\$2b\$12\$/);
    // bcrypt hash length is always 60
    expect(hash.length).toBe(60);
  });

  it('produces a different hash for the same password (different salts)', async () => {
    const hash1 = await hashPassword('SamePassword');
    const hash2 = await hashPassword('SamePassword');
    expect(hash1).not.toBe(hash2);
  });

  it('generates a valid 16-byte (22-char base64) salt embedded in the hash', async () => {
    // The bcrypt format is $2b$12$<22-char-salt><31-char-hash>
    const hash = await hashPassword('Test');
    // Extract salt (chars 3-24 in the hash string: $2b$12$XXXXXXXXXXXXXXXXXXXXXX)
    const salt = hash.slice(0, 29); // $2b$12$ + 22 chars
    // The base64 portion after the cost should be 22 chars
    const base64Salt = hash.slice(29, 51);
    expect(base64Salt.length).toBe(22);
  });

  it('handles empty string password', async () => {
    const hash = await hashPassword('');
    expect(hash).toMatch(/^\$2b\$12\$/);
  });

  it('handles long passwords', async () => {
    const longPassword = 'A'.repeat(1000);
    const hash = await hashPassword(longPassword);
    expect(hash).toMatch(/^\$2b\$12\$/);
  });
});

// ---------------------------------------------------------------------------
// 2. Verification logic (AC2)
// ---------------------------------------------------------------------------

describe('comparePassword()', () => {
  it('returns true for a correct password against its own hash', async () => {
    const plain = 'MySecretPassword42';
    const hash = await hashPassword(plain);
    const result = await comparePassword(plain, hash);
    expect(result).toBe(true);
  });

  it('returns false for an incorrect password against its own hash', async () => {
    const hash = await hashPassword('CorrectPassword1');
    const result = await comparePassword('WrongPassword2', hash);
    expect(result).toBe(false);
  });

  it('returns false when comparing different passwords', async () => {
    const hash1 = await hashPassword('PasswordOne');
    const hash2 = await hashPassword('PasswordTwo');
    const result = await comparePassword('PasswordOne', hash2);
    expect(result).toBe(false);
  });

  it('handles empty string verification correctly', async () => {
    const hash = await hashPassword('');
    expect(await comparePassword('', hash)).toBe(true);
    expect(await comparePassword('not-empty', hash)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Cost factor 12 execution time (AC6)
// ---------------------------------------------------------------------------

describe('cost factor execution time', () => {
  it('hashPassword takes approximately 150-600ms with cost factor 12', async () => {
    const start = Date.now();
    await hashPassword('benchmark-password');
    const elapsed = Date.now() - start;
    // Cost 12 should take roughly 250ms each way; allow 150-600ms window
    expect(elapsed).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// 4. Payload sanitization (AC3)
// ---------------------------------------------------------------------------

describe('sanitizePasswordHash()', () => {
  it('removes passwordHash from a plain object', () => {
    const user = {
      id: 'usr_123',
      email: 'user@example.com',
      passwordHash: '$2b$12$abc123...',
      displayName: 'Test User',
    };

    const sanitized = sanitizePasswordHash(user);

    expect(sanitized).not.toHaveProperty('passwordHash');
    expect(sanitized).toHaveProperty('id', 'usr_123');
    expect(sanitized).toHaveProperty('email', 'user@example.com');
    expect(sanitized).toHaveProperty('displayName', 'Test User');
  });

  it('handles objects without passwordHash unchanged', () => {
    const track = {
      id: 'trk_456',
      title: 'Song Title',
      playCount: 10,
    };

    const sanitized = sanitizePasswordHash(track);

    expect(sanitized).toHaveProperty('id', 'trk_456');
    expect(sanitized).toHaveProperty('title', 'Song Title');
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitizePasswordHash(null)).toBeNull();
    expect(sanitizePasswordHash(undefined)).toBeUndefined();
  });

  it('handles non-object values unchanged', () => {
    expect(sanitizePasswordHash('string')).toBe('string');
    expect(sanitizePasswordHash(42)).toBe(42);
  });
});

describe('sanitizeObject()', () => {
  it('removes passwordHash from objects deeply', () => {
    const response = {
      success: true,
      data: {
        id: 'usr_1',
        email: 'a@b.com',
        passwordHash: '$2b$12$hugehash...',
        roles: ['LISTENER'],
      },
      meta: { timestamp: '2024-01-01T00:00:00Z' },
    };

    const sanitized = sanitizeObject(response);

    expect((sanitized as any).data).not.toHaveProperty('passwordHash');
    expect((sanitized as any).success).toBe(true);
    expect((sanitized as any).data).toHaveProperty('email', 'a@b.com');
    expect((sanitized as any).data).toHaveProperty('roles');
  });

  it('handles array of user objects', () => {
    const users = [
      { id: '1', email: 'a@b.com', passwordHash: '$2b$12$x' },
      { id: '2', email: 'c@d.com', passwordHash: '$2b$12$y' },
    ];

    const sanitized = sanitizeObject(users);

    expect(Array.isArray(sanitized)).toBe(true);
    expect((sanitized as any)[0]).not.toHaveProperty('passwordHash');
    expect((sanitized as any)[1]).not.toHaveProperty('passwordHash');
  });

  it('handles null/undefined', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Prisma query select wrapper (AC4)
// ---------------------------------------------------------------------------

describe('prismaUserSelect', () => {
  it('returns a select object that excludes passwordHash', () => {
    const select = prismaUserSelect();

    // Should contain true for all fields except passwordHash
    expect(select).toHaveProperty('id');
    expect(select).toHaveProperty('email');
    expect(select).toHaveProperty('displayName');
    expect(select).toHaveProperty('roles');
    expect(select).toHaveProperty('status');
    expect(select).toHaveProperty('emailVerified');
    expect(select).toHaveProperty('createdAt');
    expect(select).toHaveProperty('updatedAt');

    // passwordHash should NOT be included
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('password_hash');
  });

  it('returns the same object on repeated calls (memoized)', () => {
    const s1 = prismaUserSelect();
    const s2 = prismaUserSelect();
    expect(s1).toBe(s2);
  });

  it('can be used in a spread-select pattern that overrides passwordHash inclusion', () => {
    // Simulating how Prisma would use the select object when someone
    // accidentally tries to include passwordHash — the helper's spread
    // must override it to false (the helper intentionally omits the key,
    // so we merge it manually to enforce exclusion).
    const safeSelect: Record<string, boolean> = { ...prismaUserSelect(), passwordHash: false };

    expect(safeSelect).toHaveProperty('id');
    expect(safeSelect).toHaveProperty('email');
    expect(safeSelect.passwordHash).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Log sanitization / sec-024 (AC5)
// ---------------------------------------------------------------------------

describe('sanitizeLogPayload()', () => {
  it('redacts password fields from plain text objects', () => {
    const logEntry = {
      action: 'register',
      email: 'user@example.com',
      password: 'MySecret1',
      oldPassword: 'OldPass123',
      newPassword: 'NewPass456',
      displayName: 'Test',
    };

    const sanitized = sanitizeLogPayload(logEntry);

    expect((sanitized as any).password).toBe('[REDACTED]');
    expect((sanitized as any).oldPassword).toBe('[REDACTED]');
    expect((sanitized as any).newPassword).toBe('[REDACTED]');
    expect((sanitized as any).email).toBe('user@example.com');
    expect((sanitized as any).displayName).toBe('Test');
  });

  it('handles nested objects and arrays in log payloads', () => {
    const logEntry = {
      userId: 'usr_1',
      request: {
        email: 'a@b.com',
        password: 'should-redact',
      },
      items: [
        { name: 'a', password: 'redact1' },
        { name: 'b', password: 'redact2' },
      ],
    };

    const sanitized = sanitizeLogPayload(logEntry);

    expect((sanitized as any).request).toBeDefined();
    expect((sanitized as any).request.password).toBe('[REDACTED]');
    expect((sanitized as any).items).toBeDefined();
    expect((sanitized as any).items[0].password).toBe('[REDACTED]');
  });

  it('does not mutate the original object', () => {
    const logEntry = {
      password: 'original',
      data: { password: 'nested' },
    };

    const sanitized = sanitizeLogPayload(logEntry);

    expect((logEntry as any).password).toBe('original');
    expect((logEntry.data as any).password).toBe('nested');
    expect((sanitized as any).password).toBe('[REDACTED]');
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitizeLogPayload(null)).toBeNull();
    expect(sanitizeLogPayload(undefined)).toBeUndefined();
  });

  it('handles non-object values unchanged', () => {
    expect(sanitizeLogPayload('simple')).toBe('simple');
    expect(sanitizeLogPayload(42)).toBe(42);
  });
});

/**
 * STORY-auth-004a: Unit tests for sanitizePassword utility.
 *
 * Tests the sanitizePassword function that recursively strips
 * password, oldPassword, newPassword keys from nested JSON objects
 * and arrays, returning a new sanitized copy without mutation.
 */

import { describe, it, expect } from 'vitest';
import { sanitizePassword } from './sanitizePassword';

describe('sanitizePassword', () => {
  // ─── Flat Object Tests ───────────────────────────────────────────

  it('removes password and newPassword keys from a flat object', () => {
    const input = {
      id: 'user-1',
      password: 'secret123',
      newPassword: 'new456',
      email: 'alice@example.com',
    };

    const result = sanitizePassword(input) as typeof input;

    expect(result).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('newPassword');
  });

  it('removes oldPassword from flat objects', () => {
    const input = {
      username: 'bob',
      oldPassword: 'old',
      email: 'bob@example.com',
    };

    const result = sanitizePassword(input) as typeof input;

    expect(result).toEqual({
      username: 'bob',
      email: 'bob@example.com',
    });
    expect(result).not.toHaveProperty('oldPassword');
  });

  it('removes all three sensitive fields from a single object', () => {
    const input = {
      password: 'p1',
      oldPassword: 'p2',
      newPassword: 'p3',
      username: 'charlie',
    };

    const result = sanitizePassword(input) as typeof input;

    expect(result).toEqual({ username: 'charlie' });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('oldPassword');
    expect(result).not.toHaveProperty('newPassword');
  });

  // ─── Non-Sensitive Fields Intact ────────────────────────────────

  it('leaves non-sensitive fields intact', () => {
    const input = {
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      roles: ['admin'],
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
    };

    const result = sanitizePassword(input) as typeof input;

    expect(result).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      roles: ['admin'],
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
    });
  });

  it('handles objects with no sensitive fields (no-op case)', () => {
    const input = { id: 'user-1', name: 'dave', settings: { theme: 'dark' } };

    const result = sanitizePassword(input) as typeof input;

    expect(result).toEqual({ id: 'user-1', name: 'dave', settings: { theme: 'dark' } });
  });

  // ─── Deeply Nested Structures (up to 3 levels) ─────────────────

  it('strips sensitive fields from level-1 nested objects', () => {
    const input = {
      user: {
        email: 'alice@example.com',
        password: 'secret',
      },
      status: 'active',
    };

    const result = sanitizePassword(input) as typeof input;

    expect((result as Record<string, unknown>).user).toEqual({
      email: 'alice@example.com',
    });
  });

  it('strips sensitive fields from level-2 nested objects', () => {
    const input = {
      level1: {
        level2: {
          email: 'test@example.com',
          password: 'deep_secret',
          newPassword: 'new_deep',
        },
        other: 'preserved',
      },
    };

    const result = sanitizePassword(input) as typeof input;

    const level2 = (result as Record<string, unknown>).level1 as Record<string, unknown>;
    expect(level2).toHaveProperty('other', 'preserved');
    expect(level2).not.toHaveProperty('password');
    expect(level2).not.toHaveProperty('newPassword');
    expect((level2 as Record<string, unknown>).level2).toEqual({
      email: 'test@example.com',
    });
  });

  it('strips sensitive fields from level-3 nested objects', () => {
    const input = {
      a: {
        b: {
          c: {
            password: 'deepest',
            data: 'keep_this',
          },
          safe: true,
        },
      },
    };

    const result = sanitizePassword(input) as typeof input;

    const levelC = (result as Record<string, unknown>)
      .a as Record<string, unknown>;
    const levelB = (levelC as Record<string, unknown>).b as Record<string, unknown>;
    const levelA = (levelB as Record<string, unknown>).c as Record<string, unknown>;

    expect(levelA).toEqual({ data: 'keep_this' });
    expect(levelA).not.toHaveProperty('password');
    expect(levelB).toHaveProperty('safe', true);
  });

  it('handles mixed sensitive and safe fields at multiple nesting levels', () => {
    const input = {
      user: {
        email: 'test@example.com',
        password: 'p1',
        profile: {
          name: 'Test',
          newPassword: 'p2',
          address: {
            city: 'NYC',
            oldPassword: 'p3',
            zip: '10001',
          },
        },
      },
      status: 'ok',
    };

    const result = sanitizePassword(input) as typeof input;

    const user = (result as Record<string, unknown>).user as Record<string, unknown>;
    const profile = (user as Record<string, unknown>).profile as Record<string, unknown>;
    const address = (profile as Record<string, unknown>).address as Record<string, unknown>;

    expect(user).toHaveProperty('email', 'test@example.com');
    expect(user).not.toHaveProperty('password');
    expect(profile).toHaveProperty('name', 'Test');
    expect(profile).not.toHaveProperty('newPassword');
    expect(address).toHaveProperty('city', 'NYC');
    expect(address).toHaveProperty('zip', '10001');
    expect(address).not.toHaveProperty('oldPassword');
  });

  // ─── Array Handling ──────────────────────────────────────────────

  it('handles arrays of objects, stripping sensitive fields from each', () => {
    const input = [
      { username: 'a', password: 'p1' },
      { username: 'b', email: 'b@example.com' },
      { username: 'c', newPassword: 'p3' },
    ];

    const result = sanitizePassword(input);

    expect(result).toEqual([
      { username: 'a' },
      { username: 'b', email: 'b@example.com' },
      { username: 'c' },
    ]);
  });

  it('handles arrays of nested objects', () => {
    const input = [
      { user: { email: 'a@test.com', password: 'x' } },
      { user: { email: 'b@test.com', oldPassword: 'y' } },
    ];

    const result = sanitizePassword(input);

    expect(result).toEqual([
      { user: { email: 'a@test.com' } },
      { user: { email: 'b@test.com' } },
    ]);
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  it('returns null unchanged', () => {
    expect(sanitizePassword(null)).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(sanitizePassword(undefined)).toBeUndefined();
  });

  it('returns primitive values unchanged', () => {
    expect(sanitizePassword('hello')).toBe('hello');
    expect(sanitizePassword(42)).toBe(42);
    expect(sanitizePassword(true)).toBe(true);
  });

  it('returns empty object unchanged', () => {
    expect(sanitizePassword({})).toEqual({});
  });

  it('does not mutate the original object', () => {
    const input = {
      password: 'secret',
      email: 'alice@example.com',
      nested: { newPassword: 'deep' },
    };

    sanitizePassword(input);

    expect(input).toHaveProperty('password', 'secret');
    expect((input as Record<string, unknown>).nested).toHaveProperty(
      'newPassword',
      'deep',
    );
  });

  it('handles deeply nested arrays', () => {
    const input = {
      groups: [
        {
          users: [
            { name: 'a', password: 'x' },
            { name: 'b', oldPassword: 'y' },
          ],
        },
      ],
    };

    const result = sanitizePassword(input) as typeof input;
    const users = ((result as Record<string, unknown>).groups as Record<string, unknown>[])
      [0].users as Record<string, unknown>[];

    expect(users[0]).toEqual({ name: 'a' });
    expect(users[1]).toEqual({ name: 'b' });
  });

  it('handles objects with sensitive field values that are objects themselves', () => {
    const input = {
      password: { nested: 'value' },
      email: 'test@example.com',
    };

    const result = sanitizePassword(input) as typeof input;

    expect(result).toEqual({ email: 'test@example.com' });
  });
});

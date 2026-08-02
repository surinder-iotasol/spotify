/**
 * STORY-auth-004b: Unit tests for auth request logging utility.
 *
 * Tests that logRequestBody safely parses and logs request bodies
 * while never exposing raw passwords in log output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logRequestBody, sanitizeForLog } from '@/lib/auth/logging';

describe('sanitizeForLog', () => {
  it('removes password fields from a flat login body', () => {
    const body = { email: 'alice@example.com', password: 'secret123' };
    const result = sanitizeForLog(body);

    expect(result).toEqual({ email: 'alice@example.com' });
  });

  it('removes oldPassword and newPassword from password-change body', () => {
    const body = { oldPassword: 'old', newPassword: 'new', currentPassword: 'current' };
    const result = sanitizeForLog(body);

    expect(result).toEqual({ currentPassword: 'current' });
  });

  it('leaves non-sensitive fields intact', () => {
    const body = { email: 'bob@test.com', displayName: 'Bob', roles: ['admin'] };
    const result = sanitizeForLog(body);

    expect(result).toEqual({ email: 'bob@test.com', displayName: 'Bob', roles: ['admin'] });
  });

  it('handles nested objects by stripping sensitive fields at any depth', () => {
    const body = {
      user: { email: 'charlie@test.com', password: 'nested' },
      metadata: { password: 'leak', version: 1 },
    };
    const result = sanitizeForLog(body);

    expect(result).toEqual({
      user: { email: 'charlie@test.com' },
      metadata: { version: 1 },
    });
  });

  it('handles null and undefined inputs', () => {
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });

  it('handles non-object primitives', () => {
    expect(sanitizeForLog('string')).toBe('string');
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(true)).toBe(true);
  });

  it('handles arrays of objects', () => {
    const body = [
      { email: 'a@test.com', password: 'p1' },
      { email: 'b@test.com', password: 'p2' },
    ];
    const result = sanitizeForLog(body);

    expect(result).toEqual([
      { email: 'a@test.com' },
      { email: 'b@test.com' },
    ]);
  });
});

describe('logRequestBody', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('logs sanitized body for POST /api/v1/auth/login', async () => {
    const body = { email: 'alice@example.com', password: 'hunter2' };
    const mockRequest = createMockRequest({ method: 'POST', body });
    const result = await logRequestBody(mockRequest, 'login');

    expect(result.originalBody).toEqual(body);
    // Verify the log call contains the email but NOT the raw password
    const logCall = consoleSpy.mock.calls[0] as unknown[];
    // The 5th argument is the sanitized body object
    const sanitizedBody = logCall.find(
      (arg) => typeof arg === 'object' && arg !== null,
    ) as Record<string, unknown> | undefined;
    expect(sanitizedBody).toEqual({ email: 'alice@example.com' });
    // Check that password value does NOT appear in any argument
    for (const arg of logCall) {
      if (typeof arg === 'string') {
        expect(arg).not.toContain('hunter2');
      }
      if (typeof arg === 'object' && arg !== null) {
        expect(arg).not.toHaveProperty('password');
      }
    }
  });

  it('logs sanitized body for POST /api/v1/auth/register', async () => {
    const body = { email: 'new@example.com', password: 'strongP@ss1', displayName: 'New User' };
    const mockRequest = createMockRequest({ method: 'POST', body });
    const result = await logRequestBody(mockRequest, 'register');

    expect(result.originalBody).toEqual(body);
    // Verify password is NOT in the log call
    const logCall = consoleSpy.mock.calls[0];
    // The sanitized body passed to log should not contain password
    const sanitizedBody = logCall.find((arg: unknown) => typeof arg === 'object' && arg !== null) as Record<string, unknown>;
    expect(sanitizedBody).not.toHaveProperty('password');
  });

  it('handles failed body parsing gracefully', async () => {
    const mockRequest = createMockRequest({ method: 'POST', jsonError: true });
    const result = await logRequestBody(mockRequest, 'register');

    expect(result.originalBody).toBeNull();
  });

  it('logs non-POST/PUT methods without sanitization overhead', async () => {
    const mockRequest = createMockRequest({ method: 'GET', body: {} });
    const result = await logRequestBody(mockRequest, 'register');

    expect(result.originalBody).toEqual({});
    expect(consoleSpy).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createMockRequest({
  method,
  body,
  jsonError,
}: {
  method: string;
  body: unknown;
  jsonError?: boolean;
}): any {
  return {
    method,
    url: `http://localhost/api/v1/auth/${method.toLowerCase()}`,
    json: jsonError
      ? async () => { throw new Error('Unexpected end of JSON input'); }
      : async () => body,
    nextUrl: {
      pathname: `/api/v1/auth/${method.toLowerCase()}`,
    },
  };
}

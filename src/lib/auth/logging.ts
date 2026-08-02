/**
 * STORY-auth-004b: Auth request logging utility.
 *
 * Provides a `logRequestBody` helper that parses incoming auth route
 * request bodies, logs a sanitized (password-stripped) version, and
 * returns the original body so downstream handlers receive full data.
 *
 * This ensures passwords never reach application or central monitoring
 * logs while preserving request integrity for handlers.
 */

import { sanitizePassword } from '@/lib/security/sanitizePassword';

/**
 * Sanitize a parsed request body for safe logging.
 * Wraps `sanitizePassword` and returns the sanitized clone.
 *
 * @param body - The already-parsed JSON body (object, array, or primitive)
 * @returns A sanitized copy with password fields removed
 */
export function sanitizeForLog(body: unknown): unknown {
  return sanitizePassword(body);
}

/**
 * Parse, sanitize, and log an incoming auth request body.
 *
 * - POST/PUT bodies are parsed, sanitized, and logged to `console.info`.
 * - GET/HEAD/OPTIONS bodies are logged without sanitization (typically empty).
 * - If body parsing fails, logs a warning and returns `{ originalBody: null }`.
 *
 * @param request - NextRequest instance from a route handler
 * @param routeName - Human-readable name for the route (e.g. "login", "register")
 * @returns `{ originalBody }` — the fully-parsed body for handler use
 */
export async function logRequestBody(
  request: {
    method: string;
    url?: string;
    json: () => Promise<unknown>;
    nextUrl?: { pathname?: string };
  },
  routeName: string,
): Promise<{ originalBody: unknown }> {
  const method = request.method?.toUpperCase() ?? 'GET';
  const path = request.nextUrl?.pathname ?? request.url ?? routeName;

  // Parse the body
  let originalBody: unknown;
  try {
    originalBody = await request.json();
  } catch {
    console.warn(
      '[auth-log]',
      routeName,
      '— failed to parse request body',
    );
    return { originalBody: null };
  }

  // POST/PUT: sanitize before logging
  if (method === 'POST' || method === 'PUT') {
    const sanitized = sanitizeForLog(originalBody);

    console.info(
      '[auth-log]',
      routeName,
      path,
      'body:',
      sanitized,
    );

    return { originalBody };
  }

  // Non-mutating methods: log body as-is (often empty or query-like)
  console.info('[auth-log]', routeName, path, 'body:', originalBody);

  return { originalBody };
}

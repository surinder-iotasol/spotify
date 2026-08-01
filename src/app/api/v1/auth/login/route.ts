/**
 * STORY-auth-002: POST /api/v1/auth/login
 *
 * Accepts { email, password }, validates credentials, enforces
 * a 5-attempt per 15-minute rate limit per IP, and returns
 * HTTP 200 with a 7-day __Host-indie_session cookie, or
 * HTTP 401 INVALID_CREDENTIALS / HTTP 429 RATE_LIMIT_EXCEEDED.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  loginSchema,
  loginUser,
  LOGIN_ERRORS,
  type LoginInput,
} from "@/lib/auth/login";
import { validateBody } from "@/lib/api/validation";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // 1. Parse body
  const body = await request.json().catch(() => null);

  // 2. Validate against login schema
  const validation = validateBody(body, loginSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          LOGIN_ERRORS.VALIDATION_FAILED,
          "Request validation failed.",
          validation.errors,
        ),
      ),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const parsed: LoginInput = validation.data!;

  // 3. Extract client IP address
  const ip =
    request.headers.get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ?? "127.0.0.1";

  // 4. Call the login service (auth + rate limit + cookie)
  const result = await loginUser(prisma as unknown as any, parsed, ip);

  // 5. Map result to HTTP response
  if (!result.success) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (result.retryAfterSeconds) {
      headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return new Response(
      JSON.stringify(
        apiErrorResponse(result.code, result.message),
      ),
      {
        status: result.status,
        headers,
      },
    );
  }

  // 6. Build 200 response with Set-Cookie header and sanitized user
  const headers = new Headers({ "Content-Type": "application/json" });
  if (result.cookie) {
    headers.set("Set-Cookie", result.cookie);
  }

  const envelope = apiSuccessResponse(
    result.user,
    { message: result.message },
  );

  return new Response(
    JSON.stringify(envelope),
    {
      status: 200,
      headers,
    },
  );
}

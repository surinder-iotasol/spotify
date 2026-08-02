/**
 * STORY-auth-001: POST /api/v1/auth/register
 *
 * Accepts { email, password, displayName }, normalises email to lowercase,
 * validates password strength, creates a User with a bcrypt(cost 12) hash
 * and role LISTENER, issues a 7-day __Host-indie_session HTTP-only cookie,
 * and returns HTTP 201 with a sanitized user envelope.
 *
 * HTTP status codes:
 *  201 — registration successful
 *  409 — email already registered (AUTH_EMAIL_EXISTS)
 *  422 — payload validation failure
 *  500 — internal server error
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  registrationSchema,
  registerUser,
  REGISTRATION_ERRORS,
  type RegistrationInput,
  type RegistrationResult,
} from "@/lib/auth/registration";
import { validateBody } from "@/lib/api/validation";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { logRequestBody } from "@/lib/auth/logging";

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // 0. Log the request body (sanitized — passwords are redacted)
  const { originalBody: body } = await logRequestBody(request, 'register');

  // 1. Guard: reject if body could not be parsed
  if (body == null) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          REGISTRATION_ERRORS.INVALID_BODY,
          "Invalid or empty request body.",
        ),
      ),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Validate against registration schema
  const validation = validateBody(body, registrationSchema);

  if (!validation.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          REGISTRATION_ERRORS.VALIDATION_FAILED,
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

  const parsed: RegistrationInput = validation.data!;

  // 3. Call the registration service (DB + hash + cookie)
  const result = await registerUser(prisma as unknown as any, parsed);

  // 4. Map result to HTTP response
  if (!result.success) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(result.code, result.message),
      ),
      {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 5. Build 201 response with Set-Cookie header and sanitized user
  const headers = new Headers({
    "Content-Type": "application/json",
  });
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
      status: 201,
      headers,
    },
  );
}

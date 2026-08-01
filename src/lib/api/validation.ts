/**
 * Zod schema validation helpers for Next.js API routes.
 *
 * Provides a `validateBody(body, schema)` function that validates
 * an incoming request body against a Zod schema and returns an
 * HTTP 422 Response with structured `ValidationErrorDetail` arrays
 * on failure.
 */

import type { ZodSchema, ZodError } from "zod";
import {
  apiErrorResponse,
  type ValidationErrorDetail,
} from "./response";

/* ------------------------------------------------------------------ */
/*  Validation result type                                             */
/* ------------------------------------------------------------------ */

export interface ValidationResult<T> {
  ok: boolean;
  data: T | null;
  response: Response | null;
  errors: ValidationErrorDetail[];
}

/* ------------------------------------------------------------------ */
/*  Zod error → ValidationErrorDetail mapping                          */
/* ------------------------------------------------------------------ */

/**
 * Convert a ZodError into an array of ValidationErrorDetail objects.
 */
export function zodErrorToDetails(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((err) => {
    const code = err.code === "custom"
      ? "INVALID_INPUT"
      : `VALIDATION_${err.code}`;

    return {
      code,
      path: err.path,
      message: err.message,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Validation function                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a parsed request body against a Zod schema.
 *
 * On success, returns `{ ok: true, data: <parsed>, response: null }`.
 * On failure, returns `{ ok: false, errors: [...], response: <422 Response> }`.
 *
 * @param body   - The parsed request body (typically from `req.json()`).
 * @param schema - A Zod schema to validate the body against.
 */
export function validateBody<T>(
  body: unknown,
  schema: ZodSchema<T>,
): ValidationResult<T> {
  if (body === undefined || body === null) {
    return {
      ok: false,
      data: null,
      response: new Response(
        JSON.stringify(
          apiErrorResponse(
            "VALIDATION_BODY_EMPTY",
            "Request body is required and must be valid JSON.",
          ),
        ),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      ),
      errors: [
        {
          code: "VALIDATION_BODY_EMPTY",
          path: [],
          message: "Request body is required and must be valid JSON.",
        },
      ],
    };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    const details = zodErrorToDetails(result.error);

    return {
      ok: false,
      data: null,
      response: new Response(
        JSON.stringify(
          apiErrorResponse(
            "VALIDATION_FAILED",
            "Request validation failed.",
            details,
          ),
        ),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      ),
      errors: details,
    };
  }

  return {
    ok: true,
    data: result.data,
    response: null,
    errors: [],
  };
}

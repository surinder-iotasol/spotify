/**
 * Standardized REST API response envelope helpers.
 *
 * Every API response uses a consistent outer shell:
 *   - success: boolean flag
 *   - data / error: payload body
 *   - meta: metadata (timestamp, requestId)
 *
 * All timestamps use UTC ISO-8601 format.
 */

/**
 * Generate a deterministic request ID for tracing.
 * Falls back to crypto.randomUUID when available,
 * otherwise uses a time-entropy fallback.
 */
function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Return the current UTC time as an ISO-8601 string.
 */
function utcTimestamp(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/*  Success envelope                                                   */
/* ------------------------------------------------------------------ */

export interface SuccessMeta {
  [key: string]: unknown;
}

export interface ApiResponseSuccess<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;   // UTC ISO-8601
    requestId: string;
  } & SuccessMeta;
}

/**
 * Construct a standard JSON success response envelope.
 *
 * @param data  - The payload data to return.
 * @param meta  - Optional extra metadata merged into the meta block.
 */
export function apiSuccessResponse<T>(
  data: T,
  meta?: SuccessMeta,
): ApiResponseSuccess<T> {
  const baseMeta: SuccessMeta = {
    timestamp: utcTimestamp(),
    requestId: generateRequestId(),
  };

  const combinedMeta: SuccessMeta = meta
    ? { ...baseMeta, ...meta }
    : baseMeta;

  return {
    success: true,
    data,
    meta: combinedMeta as typeof combinedMeta & {
      timestamp: string;
      requestId: string;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Error envelope                                                     */
/* ------------------------------------------------------------------ */

export interface ValidationErrorDetail {
  code: string;        // machine-readable validation code
  path: string[];      // JSON pointer path to the failing field
  message: string;     // human-readable error description
}

export interface ApiError {
  code: string;        // machine-readable error code
  message: string;     // human-readable error description
  details?: ValidationErrorDetail[];
}

export interface ApiResponseError {
  success: false;
  error: ApiError;
  meta: {
    timestamp: string;   // UTC ISO-8601
    requestId: string;
  };
}

/**
 * Construct a standard JSON error response envelope.
 *
 * Sensitive fields (password, passwordHash, etc.) are automatically
 * stripped from the payload and any details to prevent leakage.
 *
 * @param code      - Machine-readable error code.
 * @param message   - Human-readable error description.
 * @param details   - Optional array of validation error details.
 */
export function apiErrorResponse(
  code: string,
  message: string,
  details?: ValidationErrorDetail[],
): ApiResponseError {
  const sanitizedDetails = details
    ? sanitizeDetails(details)
    : undefined;

  return {
    success: false,
    error: {
      code,
      message,
      details: sanitizedDetails,
    },
    meta: {
      timestamp: utcTimestamp(),
      requestId: generateRequestId(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * List of field names that MUST never appear in response payloads
 * or error detail arrays.
 */
export const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "password_hash",
  "secret",
  "secretKey",
  "secret_key",
  "accessToken",
  "access_token",
  "token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "credentials",
];

/**
 * Sanitize an array of ValidationErrorDetail by stripping
 * sensitive field references from the path and masking values.
 */
export function sanitizeDetails(
  details: ValidationErrorDetail[],
): ValidationErrorDetail[] {
  return details.map((detail) => {
    const path = Array.isArray(detail.path) ? detail.path : [];
    const cleanedPath = path.filter(
      (segment) => !SENSITIVE_FIELDS.includes(segment),
    );

    // Mask any value-like content in the message after sensitive field names
    const maskedMessage = SENSITIVE_FIELDS.reduce((msg, field) => {
      // Replace value after "field: value" or "field=value" patterns
      const regex = new RegExp(`(${field}[:=])\\s*\\S+`, "gi");
      return msg.replace(regex, `$1 [REDACTED]`);
    }, detail.message);

    return {
      ...detail,
      path: cleanedPath,
      message: maskedMessage,
    };
  });
}

/**
 * Deeply sanitize an object by redacting sensitive field values.
 * Useful for logging or debugging before sending payloads.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "object" && item !== null ? sanitizeObject(item) : item,
    ) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      // Redact top-level sensitive values; recurse into nested objects
      // so inner fields can still be sanitized individually.
      if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = "[REDACTED]";
      }
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

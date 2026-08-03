/**
 * STORY-profile-003a: Multipart image upload middleware.
 *
 * Parses multipart/form-data requests and validates the uploaded image
 * file for size (max 5 MB) and MIME type (jpeg, png, webp).
 *
 * Returns a typed result with the file buffer and metadata on success,
 * or a Response with 422 status and error code on validation failure.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Maximum allowed image file size: 5 MB in bytes. */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types for profile images. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Error codes used for validation failures. */
const ERROR_CODES = {
  INVALID_AVATAR_URL: "INVALID_AVATAR_URL",
  INVALID_HEADER_URL: "INVALID_HEADER_URL",
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Minimal request-like interface accepted by the middleware.
 */
export interface MultipartRequest {
  headers: { get(key: string): string | null };
}

/**
 * Parsed image file with its buffer and metadata.
 */
export interface ParsedImageFile {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Result of the middleware — either parsed image or an HTTP error Response.
 */
export type MultipartImageResult = ParsedImageFile | Response;

/* ------------------------------------------------------------------ */
/*  Middleware                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parse and validate a multipart image upload.
 *
 * - Checks Content-Type for `multipart/form-data`.
 * - Extracts the `file` field from the form data.
 * - Enforces the 5 MB size limit.
 * - Validates MIME type against allowed types (jpeg, png, webp).
 *
 * On success, returns `{ buffer, mimeType }`.
 * On failure, returns a `Response` with status 422 and
 * the appropriate error code (`INVALID_AVATAR_URL` or `INVALID_HEADER_URL`).
 *
 * @param request  - The incoming request object.
 * @param uploadType - `"avatar"` or `"header"` to determine the error code.
 * @returns Parsed image file or an HTTP error response.
 */
export async function parseMultipartImage(
  request: MultipartRequest,
  uploadType: "avatar" | "header",
): Promise<MultipartImageResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return errorResponse(
      uploadType,
      "Request body must be multipart/form-data.",
    );
  }

  // The request must also be a NextRequest for formData() support.
  if (!("formData" in request)) {
    return errorResponse(
      uploadType,
      "No valid image file provided.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextRequest = request as any;
  let formData: FormData;
  try {
    formData = await nextRequest.formData();
  } catch {
    return errorResponse(
      uploadType,
      "Failed to parse multipart form data.",
    );
  }

  const file = formData.get("file") as unknown as File | null;
  if (!file || !(file instanceof File)) {
    return errorResponse(
      uploadType,
      "No valid image file provided.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Enforce 5 MB size limit
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return errorResponse(
      uploadType,
      `Image file exceeds 5MB limit.`,
    );
  }

  // Validate MIME type
  const mimeType = file.type ?? "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return errorResponse(
      uploadType,
      `Unsupported image type: ${mimeType}. Allowed types: JPEG, PNG, WebP.`,
    );
  }

  return { buffer, mimeType };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a 422 error Response with the appropriate error code.
 */
function errorResponse(
  uploadType: "avatar" | "header",
  message: string,
): Response {
  const code =
    uploadType === "avatar"
      ? ERROR_CODES.INVALID_AVATAR_URL
      : ERROR_CODES.INVALID_HEADER_URL;

  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code,
        message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID?.() ?? `req-${Date.now()}`,
      },
    }),
    {
      status: 422,
      headers: { "Content-Type": "application/json" },
    },
  );
}

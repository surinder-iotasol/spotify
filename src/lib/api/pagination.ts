/**
 * Standardized limit-offset pagination contracts and response helpers
 * for REST collection endpoints.
 *
 * - Page numbers are 1-indexed.
 * - Default limit is 20 items per page.
 * - Maximum limit is capped at 100.
 * - Paginated API response JSON structures follow a consistent envelope.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PaginationParams {
  page: number;     // 1-indexed page number
  limit: number;    // items per page (1..100)
  offset: number;   // 0-based offset into the collection
}

export interface PaginationMeta {
  /** Total number of items across all pages */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  meta: {
    requestId?: string;
    timestamp?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;
const MIN_PAGE = 1;

/* ------------------------------------------------------------------ */
/*  parsePaginationParams                                              */
/* ------------------------------------------------------------------ */

/**
 * Parse `page` and `limit` query parameters from a URL.
 *
 * - `page` defaults to 1; values below 1 are clamped to 1.
 * - `limit` defaults to 20; values below 1 are clamped to 1; values
 *   exceeding 100 are clamped to 100.
 * - `offset` is derived as `(page - 1) * limit`.
 */
export function parsePaginationParams(url: URL | string): PaginationParams {
  const href = url instanceof URL ? url.toString() : url;
  const searchParams = new URL(href).searchParams;

  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");

  const page = clampInt(rawPage, DEFAULT_PAGE, MIN_PAGE, Infinity);
  const limit = clampInt(rawLimit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

/* ------------------------------------------------------------------ */
/*  apiPaginatedResponse                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a paginated API response envelope.
 *
 * @param data   - The array of items for the current page.
 * @param total  - Total number of items across all pages.
 * @param page   - Current 1-indexed page number.
 * @param limit  - Items per page.
 */
export function apiPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    },
    meta: {
      requestId: generateRequestId(),
      timestamp: utcTimestamp(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate a deterministic request ID for tracing.
 */
function generateRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
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

/**
 * Parse a string as an integer and clamp it between min and max.
 */
function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw === "") {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

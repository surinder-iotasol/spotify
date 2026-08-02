/**
 * STORY-role-002: Rate limiter for verification email requests.
 *
 * Enforces sec-025: maximum 3 verification email requests per 15-minute
 * window per IP address.  Uses an in-memory sliding window store.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** In-memory rate-limit bucket for a given IP. */
interface RateLimitBucket {
  /** Sorted array of attempt timestamps (Unix epoch ms). */
  attempts: number[];
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Check (and optionally record) verification email requests for an IP address.
 *
 * @param ip   — Client IP address string.
 * @param record — If true, record this attempt after checking.
 * @returns `{ allowed: true }` if under the limit,
 *          or `{ allowed: false; retryAfterSeconds: number }` if exceeded.
 */
export function checkVerificationRateLimit(
  ip: string,
  record = false,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = rateLimitStore.get(ip);

  if (!bucket) {
    bucket = { attempts: [] };
    rateLimitStore.set(ip, bucket);
  }

  // Purge attempts outside the current window
  const windowStart = now - WINDOW_MS;
  bucket.attempts = bucket.attempts.filter((t) => t > windowStart);

  if (bucket.attempts.length >= MAX_ATTEMPTS) {
    const oldest = bucket.attempts[0];
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  if (record) {
    bucket.attempts.push(now);
  }

  return { allowed: true };
}

/**
 * Clear the rate-limit store (useful in tests).
 */
export function clearVerificationRateLimitStore(): void {
  rateLimitStore.clear();
}

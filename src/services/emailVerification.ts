/**
 * STORY-role-002: Email verification token generation and dispatch service.
 *
 * - Generates a 64-character hex token via crypto.randomBytes(32).
 * - Stores a SHA-256 digest of the token in the database.
 * - Sets expiresAt to 24 hours in the future.
 * - Invalidates any existing active verification tokens for the user.
 * - Dispatches a verification link via email (stubbed for now).
 */

import { randomBytes, createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Configuration for verification token generation. */
export interface VerificationTokenConfig {
  /** Token expiration duration in seconds (default 86400 = 24 hours). */
  expirationSeconds?: number;
  /** Verification base URL (e.g. "https://example.com/verify"). */
  verificationBaseUrl?: string;
}

/** Result of generating a verification token. */
export interface VerificationTokenResult {
  /** Whether the operation succeeded. */
  success: boolean;
  /** HTTP status code. */
  status: number;
  /** Error code on failure. */
  code: string;
  /** Error message on failure. */
  message: string;
  /** The raw token (returned once to caller for logging/tracking only). */
  rawToken?: string;
  /** The SHA-256 hex digest stored in the database. */
  tokenHash: string;
  /** Expiration time in UTC ISO-8601. */
  expiresAt: string;
  /** Seconds until expiration (86400 by default). */
  expiresInSeconds: number;
  /** Verification link URL (for email dispatch). */
  verificationUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_EXPIRATION_SECONDS = 86400; // 24 hours
const TOKEN_BYTE_LENGTH = 32; // 32 bytes → 64 hex characters

const ERROR_CODES = {
  INTERNAL_ERROR: "INTERNAL_ERROR",
  USER_NOT_FOUND: "USER_NOT_FOUND",
} as const;

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Hash a raw token using SHA-256 and return the hex digest.
 *
 * @param rawToken - The raw token string.
 * @returns The SHA-256 hex digest (64 characters).
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a cryptographically secure random token.
 *
 * Uses crypto.randomBytes(32) to produce a 64-character hex string.
 *
 * @returns The raw token string.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
}

/**
 * Generate a verification token for a user.
 *
 * 1. Generates a 64-char hex token via crypto.randomBytes(32).
 * 2. Hashes the token with SHA-256.
 * 3. Invalidates any existing active verification tokens for the user.
 * 4. Stores the new token hash with expiresAt = now + 24 hours.
 * 5. Dispatches the verification link via email.
 *
 * @param prisma   - PrismaClient instance.
 * @param userId   - The ID of the user requesting verification.
 * @param config   - Optional configuration.
 * @param email    - The user's email address (for email dispatch).
 * @returns VerificationTokenResult with success status and metadata.
 */
export async function generateVerificationToken(
  prisma: PrismaClient,
  userId: string,
  config: VerificationTokenConfig = {},
  email: string = "",
): Promise<VerificationTokenResult> {
  const {
    expirationSeconds = DEFAULT_EXPIRATION_SECONDS,
    verificationBaseUrl = "https://example.com",
  } = config;

  try {
    // 1. Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return {
        success: false,
        status: 404,
        code: ERROR_CODES.USER_NOT_FOUND,
        message: "User not found.",
        tokenHash: "",
        expiresAt: "",
        expiresInSeconds: 0,
      };
    }

    // 2. Generate a cryptographically secure token
    const rawToken = generateToken();

    // 3. Hash the token with SHA-256
    const tokenHash = hashToken(rawToken);

    // 4. Calculate expiration time
    const expiresAt = new Date(Date.now() + expirationSeconds * 1000);

    // 5. Invalidate any existing active verification tokens for this user
    await prisma.verificationToken.updateMany({
      where: {
        userId,
        invalid: false,
      },
      data: {
        invalid: true,
      },
    });

    // 6. Store the new token hash in the database
    await prisma.verificationToken.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        tokenHash,
        expiresAt,
        invalid: false,
      },
    });

    // 7. Build the verification URL
    const verificationUrl = `${verificationBaseUrl}/verify-email?token=${rawToken}&userId=${userId}`;

    // 8. Dispatch the verification email (stubbed for now)
    await dispatchVerificationEmail(email, verificationUrl);

    // 9. Return success result
    return {
      success: true,
      status: 202,
      code: "",
      message: "Verification email sent.",
      rawToken, // Only for logging/tracking — should not be returned to client in production
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: expirationSeconds,
      verificationUrl,
    };
  } catch (error) {
    // Log the error internally (do not expose details to client)
    console.error("Failed to generate verification token:", error);

    return {
      success: false,
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Internal server error.",
      tokenHash: "",
      expiresAt: "",
      expiresInSeconds: 0,
    };
  }
}

/**
 * Dispatch a verification email to the user.
 *
 * This is a stub implementation. In production, this would integrate
 * with an email service (e.g., SendGrid, AWS SES, Postmark).
 *
 * @param email      - The recipient's email address.
 * @param verificationUrl - The single-use verification link.
 * @returns Promise resolving when dispatch is complete.
 */
export async function dispatchVerificationEmail(
  email: string,
  verificationUrl: string,
): Promise<void> {
  // TODO: Integrate with actual email service (e.g., SendGrid, AWS SES)
  // For now, log the verification link (in production, never log URLs with tokens)
  console.log(`[VerificationEmail] Would send to ${email}: ${verificationUrl}`);
}

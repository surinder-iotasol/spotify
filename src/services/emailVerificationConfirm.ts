/**
 * STORY-role-003: Email verification token confirmation and status service.
 *
 * - verifyEmailToken: validates incoming raw tokens against SHA-256 digests,
 *   updates emailVerified, deletes used tokens.
 * - getVerificationStatus: retrieves email verification status for a user.
 */

import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Result of token verification. */
export interface VerifyEmailTokenResult {
  success: boolean;
  status: number;
  code: string;
  message: string;
  userId?: string;
}

/** Verification status data returned to the client. */
export interface VerificationStatusData {
  emailVerified: boolean;
  canUpload: boolean;
  roles: string[];
}

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

const ERROR_CODES = {
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_VERIFICATION_TOKEN: "INVALID_VERIFICATION_TOKEN",
  USER_NOT_FOUND: "USER_NOT_FOUND",
} as const;

/* ------------------------------------------------------------------ */
/*  Service functions                                                  //
/* ------------------------------------------------------------------ */

/**
 * Verify an email token by hashing the raw token and matching against
 * active (non-expired, non-invalid) records in the database.
 *
 * If a match is found and the token is unexpired:
 * - Sets User.emailVerified = true
 * - Sets User.emailVerifiedAt = current UTC timestamp
 * - Deletes the used verification token record
 *
 * @param prisma - PrismaClient instance.
 * @param rawToken - The raw token string from the request body.
 * @returns VerifyEmailTokenResult with success status and metadata.
 */
export async function verifyEmailToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<VerifyEmailTokenResult> {
  if (!rawToken || typeof rawToken !== "string") {
    return {
      success: false,
      status: 400,
      code: ERROR_CODES.INVALID_VERIFICATION_TOKEN,
      message: "Token is required.",
    };
  }

  try {
    // 1. Hash the incoming raw token with SHA-256
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    // 2. Look for an active, unexpired verification token
    const activeToken = await prisma.verificationToken.findFirst({
      where: {
        tokenHash,
        invalid: false,
        expiresAt: {
          gt: new Date(), // must not be expired
        },
      },
      include: {
        user: {
          select: {
            id: true,
            emailVerified: true,
            roles: true,
          },
        },
      },
    });

    if (!activeToken) {
      return {
        success: false,
        status: 400,
        code: ERROR_CODES.INVALID_VERIFICATION_TOKEN,
        message: "Verification token is invalid or has expired.",
      };
    }

    // 3. Update the user's email verification status
    const updatedUser = await prisma.user.update({
      where: { id: activeToken.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        emailVerified: true,
        emailVerifiedAt: true,
      },
    });

    // 4. Delete the used token record
    await prisma.verificationToken.deleteMany({
      where: {
        id: activeToken.id,
      },
    });

    // 5. Return success
    return {
      success: true,
      status: 200,
      code: "",
      message: "Email verified successfully.",
      userId: updatedUser.id,
    };
  } catch (error) {
    console.error("Failed to verify email token:", error);

    return {
      success: false,
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Internal server error.",
    };
  }
}

/**
 * Get the email verification status for a user.
 *
 * @param prisma - PrismaClient instance.
 * @param userId - The user ID to check.
 * @returns VerificationStatusData with emailVerified, canUpload, and roles.
 */
export async function getVerificationStatus(
  prisma: PrismaClient,
  userId: string,
): Promise<VerificationStatusData> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        roles: true,
      },
    });

    if (!user) {
      return {
        emailVerified: false,
        canUpload: false,
        roles: [],
      };
    }

    // canUpload is true only if the user has verified their email
    // and has an ARTIST role (or ADMIN role)
    const hasArtistOrAdminRole = user.roles.includes("ARTIST") || user.roles.includes("ADMIN");
    const canUpload = user.emailVerified && hasArtistOrAdminRole;

    return {
      emailVerified: user.emailVerified,
      canUpload,
      roles: user.roles,
    };
  } catch (error) {
    console.error("Failed to get verification status:", error);

    return {
      emailVerified: false,
      canUpload: false,
      roles: [],
    };
  }
}

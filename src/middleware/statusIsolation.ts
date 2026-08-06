/**
 * STORY-profile-005: Account status isolation filter (middleware).
 *
 * Provides a lightweight helper to check whether a User record has a
 * SUSPENDED or BANNED status, and a standardized error envelope for
 * returning HTTP 404 Not Found for those accounts.
 *
 * Per DEC-003: suspended/banned accounts are soft-hidden — database
 * records remain intact, but public profile endpoints return 404.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/**
 * Standardized error codes for suspended/banned account responses.
 */
export const SUSPENDED_USER_ERROR_CODES = {
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Minimal Prisma-like interface for User queries.
 * Only selects the `status` field for efficiency.
 */
export interface PrismaUserQuery {
  user: {
    findUnique: (args: {
      where: { id: string };
      select?: { status?: boolean };
    }) => Promise<{ status?: string } | null>;
  };
}

/**
 * Standardized error envelope for suspended/banned account responses.
 */
export interface SuspendedUserError {
  success: false;
  code: string;
  message: string;
  status: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Check whether a user account is SUSPENDED or BANNED.
 *
 * Performs a minimal query (selecting only `status`) to avoid
 * loading unnecessary user data.
 *
 * @param prisma - PrismaClient or mock with a `user.findUnique` method.
 * @param userId - MongoDB ObjectId string of the user to check.
 * @returns true if the user is SUSPENDED or BANNED, false otherwise.
 *          Returns false when the user is not found (caller should handle).
 */
export async function isAccountSuspended(
  prisma: PrismaUserQuery,
  userId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!user || !user.status) {
    return false;
  }

  return user.status === "SUSPENDED" || user.status === "BANNED";
}

/**
 * Return a standardized error envelope for a suspended/banned account.
 *
 * Always returns HTTP 404 Not Found so that the client cannot
 * distinguish between a non-existent profile and a soft-hidden one.
 *
 * @returns SuspendedUserError with status 404.
 */
export function getSuspendedUserError(): SuspendedUserError {
  return {
    success: false,
    code: SUSPENDED_USER_ERROR_CODES.ACCOUNT_SUSPENDED,
    message: "This account has been suspended and is no longer available.",
    status: 404,
  };
}

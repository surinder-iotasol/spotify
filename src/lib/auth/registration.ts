/**
 * STORY-auth-001: User registration validation schema and service.
 *
 * - Zod schema validates { email, password, displayName }.
 * - email is normalised to lowercase.
 * - Password strength: min 8 chars, 1 uppercase, 1 lowercase, 1 digit.
 * - Service creates User with bcrypt(cost=12) hash, role LISTENER,
 *   issues a 7-day __Host-indie_session cookie, returns sanitized user.
 */

import { z } from "zod";
import { hashPassword, type UserRole, generateToken, SESSION_COOKIE_NAME } from ".";
import { sanitizePasswordHash } from "@/lib/security/password";
import type { ValidationErrorDetail } from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Validation schema                                                  */
/* ------------------------------------------------------------------ */

/**
 * Registration input schema.
 * - email: non-empty string, validated as email format, normalised to lowercase.
 * - password: min 8 chars, must contain at least 1 uppercase, 1 lowercase, 1 digit.
 * - displayName: non-empty string, trimmed, 1-80 characters.
 */
export const registrationSchema = z.object({
  email: z.string().email("Email must be a valid email address").transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit"),
  displayName: z.string().min(1, "Display name is required").transform((v) => v.trim()).refine((v) => v.length <= 80, {
    message: "Display name must be at most 80 characters",
  }),
});

/** Input type after schema transformation. */
export interface RegistrationInput {
  email: string;
  password: string;
  displayName: string;
}

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Registration-specific error codes.
 */
export const REGISTRATION_ERRORS = {
  EMAIL_EXISTS: "AUTH_EMAIL_EXISTS",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/* ------------------------------------------------------------------ */
/*  Registration result                                                */
/* ------------------------------------------------------------------ */

/**
 * Return type for `registerUser`.
 */
export interface RegistrationResult {
  /** Whether the registration succeeded. */
  success: boolean;
  /** HTTP status code to return. */
  status: number;
  /** Error code for the response. */
  code: string;
  /** Error message for the response. */
  message: string;
  /** Sanitised user object on success. */
  user: Record<string, unknown> | null;
  /** Session cookie header string on success. */
  cookie: string | null;
  /** Validation details on failure. */
  details?: ValidationErrorDetail[];
}

/* ------------------------------------------------------------------ */
/*  Service function                                                   */
/* ------------------------------------------------------------------ */

/**
 * Prisma User model fields we select for the API response.
 */
const userResponseFields = {
  id: true,
  email: true,
  displayName: true,
  roles: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Register a new user.
 *
 * @param prisma  - PrismaClient instance (injected for testability).
 * @param input   - Validated registration payload.
 * @returns RegistrationResult with status code, user envelope, and cookie.
 */
export async function registerUser(
  prisma: {
    user: {
      findUnique: (args: { where: { email: string } }) => Promise<unknown | null>;
      create: (args: {
        data: {
          id: string;
          email: string;
          passwordHash: string;
          displayName: string;
          roles: string[];
          status: string;
          emailVerified: boolean;
        };
        select: typeof userResponseFields;
      }) => Promise<unknown>;
    };
  },
  input: RegistrationInput,
): Promise<RegistrationResult> {
  // 0. Normalise email defensively (schema already does this in happy path;
  //    callers that invoke the service directly may still pass raw input).
  const normalisedEmail = input.email.toLowerCase();

  // 1. Check for existing email (uniqueness constraint)
  const existing = await prisma.user.findUnique({
    where: { email: normalisedEmail },
  });

  if (existing) {
    return {
      success: false,
      status: 409,
      code: REGISTRATION_ERRORS.EMAIL_EXISTS,
      message: "An account with this email address is already registered.",
      user: null,
      cookie: null,
    };
  }

  try {
    // 2. Hash the password with bcrypt cost 12
    const passwordHash = await hashPassword(input.password);

    // 3. Create the User record with LISTENER role
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: normalisedEmail,
        passwordHash,
        displayName: input.displayName,
        roles: ["LISTENER"],
        status: "ACTIVE",
        emailVerified: false,
      },
      select: userResponseFields,
    });

    // 4. Sanitize passwordHash from the user object (should already be excluded by select, but be safe)
    const sanitizedUser = sanitizePasswordHash(user) as Record<string, unknown>;

    // 5. Generate JWT session token (7-day TTL)
    const token = generateToken({
      sub: sanitizedUser.id as string,
      role: "LISTENER" as UserRole,
    });

    // 6. Build the Set-Cookie header
    const cookieParts = [
      `${SESSION_COOKIE_NAME}=${token}`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/",
      `Max-Age=604800`,
    ];
    const cookie = cookieParts.join("; ");

    // 7. Return success envelope with sanitized user
    return {
      success: true,
      status: 201,
      code: "CREATED",
      message: "Registration successful.",
      user: sanitizedUser,
      cookie,
    };
  } catch (error) {
    // Catch duplicate key / unique constraint violations from the DB layer
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    if (errMessage.toLowerCase().includes("duplicate key") || errMessage.toLowerCase().includes("unique")) {
      return {
        success: false,
        status: 409,
        code: REGISTRATION_ERRORS.EMAIL_EXISTS,
        message: "An account with this email address is already registered.",
        user: null,
        cookie: null,
      };
    }

    return {
      success: false,
      status: 500,
      code: REGISTRATION_ERRORS.INTERNAL_ERROR,
      message: "An internal error occurred during registration.",
      user: null,
      cookie: null,
    };
  }
}

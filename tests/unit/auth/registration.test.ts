/**
 * STORY-auth-001: Unit tests for registration schema validation and
 * the `registerUser` service function.
 *
 * Acceptance criteria covered:
 * 1. Accepts { email, password, displayName }, normalises email to lowercase,
 *    validates password strength (min 8 chars, 1 uppercase, 1 lowercase, 1 digit).
 * 3. Hashes password using bcrypt cost 12 and creates User record with role LISTENER.
 * 4. Sets __Host-indie_session cookie and returns HTTP 201 with sanitized user.
 * 5. Timestamps stored/returned in UTC ISO-8601 format.
 * 6. Passwords sanitized out of response payloads.
 */

import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";
import {
  registrationSchema,
  registerUser,
  REGISTRATION_ERRORS,
  type RegistrationInput,
  type RegistrationResult,
} from "../../../src/lib/auth/registration";

/* ------------------------------------------------------------------ */
/*  Shared setup                                                       */
/* ------------------------------------------------------------------ */

const TEST_SECRET =
  "test-secret-key-for-unit-testing-must-be-at-least-256-bits-long";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Helper: create a mock Prisma user store                            */
/* ------------------------------------------------------------------ */

function createMockPrisma(existingEmails: string[] = []) {
  const existingSet = new Set(existingEmails);

  return {
    user: {
      findUnique: vi.fn((args: { where: { email: string } }) => {
        const exists = existingSet.has(args.where.email);
        return Promise.resolve(
          exists
            ? {
                id: "existing-user-1",
                email: args.where.email,
                displayName: "Existing User",
                passwordHash: "$2b$12$alreadyhashed",
                roles: ["LISTENER"],
                status: "ACTIVE",
                emailVerified: false,
                createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
                updatedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
              }
            : null,
        );
      }),
      create: vi.fn(async (args: { data: Record<string, unknown>; select: Record<string, boolean> }) => {
        const { email } = args.data;
        if (existingSet.has(email as string)) {
          throw new Error("Unique constraint failed on the fields: (`email`)");
        }
        existingSet.add(email as string);

        const user = {
          id: args.data.id as string,
          email: email as string,
          displayName: args.data.displayName as string,
          roles: args.data.roles as string[],
          status: args.data.status as string,
          emailVerified: args.data.emailVerified as boolean,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        return user;
      }),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  AC1 — Validation schema: email normalisation & password strength   */
/* ------------------------------------------------------------------ */

describe("registrationSchema — email normalisation (AC1)", () => {
  it("normalises uppercase email to lowercase", () => {
    const result = registrationSchema.safeParse({
      email: "USER@Example.COM",
      password: "Password1a",
      displayName: "Test User",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("accepts already-lowercase email", () => {
    const result = registrationSchema.safeParse({
      email: "lowercase@test.com",
      password: "Password1a",
      displayName: "Test User",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("lowercase@test.com");
    }
  });

  it("rejects invalid email format", () => {
    const result = registrationSchema.safeParse({
      email: "not-an-email",
      password: "Password1a",
      displayName: "Test User",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = registrationSchema.safeParse({
      password: "Password1a",
      displayName: "Test User",
    });

    expect(result.success).toBe(false);
  });
});

describe("registrationSchema — password strength (AC1)", () => {
  it("accepts password with min 8 chars, uppercase, lowercase, digit", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "SecurePass1",
      displayName: "Valid User",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.password).toBe("SecurePass1");
    }
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Ab1!",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects password with no uppercase letter", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "password1a",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects password with no lowercase letter", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "PASSWORD1A",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects password with no digit", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "PasswordAB",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });

  it("accepts password exactly 8 characters with all requirements", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Aa1xxxxx",
      displayName: "Test",
    });

    expect(result.success).toBe(true);
  });
});

describe("registrationSchema — displayName (AC1)", () => {
  it("trims whitespace from displayName", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Password1a",
      displayName: "  Trimmed Name  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Trimmed Name");
    }
  });

  it("rejects empty displayName", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Password1a",
      displayName: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects displayName exceeding 80 characters", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Password1a",
      displayName: "A".repeat(81),
    });

    expect(result.success).toBe(false);
  });

  it("accepts displayName exactly 80 characters", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Password1a",
      displayName: "A".repeat(80),
    });

    expect(result.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  AC1, 3, 4, 5, 6 — registerUser service                           */
/* ------------------------------------------------------------------ */

describe("registerUser — happy path (AC1, 3, 4, 5, 6)", () => {
  it("creates a user with LISTENER role and returns 201", async () => {
    const mockPrisma = createMockPrisma();
    const input: RegistrationInput = {
      email: "newuser@example.com",
      password: "SecurePass1",
      displayName: "New User",
    };

    const result = await registerUser(mockPrisma as any, input);

    expect(result.success).toBe(true);
    expect(result.status).toBe(201);
    expect(result.code).toBe("CREATED");
    expect(result.user).not.toBeNull();
    expect(result.cookie).toBeDefined();
    expect(typeof result.cookie).toBe("string");

    // Verify user object has expected fields
    const user = result.user! as Record<string, unknown>;
    expect(user.id).toBeDefined();
    expect(user.email).toBe("newuser@example.com");
    expect(user.displayName).toBe("New User");
    expect(user.roles).toEqual(["LISTENER"]);
    expect(user.status).toBe("ACTIVE");
    expect(user.emailVerified).toBe(false);
    expect(user.createdAt).toBeDefined();
    expect(typeof user.createdAt).toBe("string");

    // Verify createdAt is ISO-8601 UTC format
    expect(user.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

    // Verify passwordHash is NOT in the response
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");

    // Verify the cookie includes session token
    const prismaCreateCall = (mockPrisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prismaCreateCall[0].data.roles).toEqual(["LISTENER"]);
    // passwordHash should be present in the create data (to be stored)
    expect(prismaCreateCall[0].data.passwordHash).toBeDefined();
    expect(typeof prismaCreateCall[0].data.passwordHash).toBe("string");
    expect(prismaCreateCall[0].data.passwordHash).toMatch(/^\$2b\$12\$/);
  });

  it("normalises email to lowercase before creating user", async () => {
    const mockPrisma = createMockPrisma();
    const input: RegistrationInput = {
      email: "UPPER@Case.COM",
      password: "SecurePass1",
      displayName: "Case User",
    };

    await registerUser(mockPrisma as any, input);

    const createCall = (mockPrisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(createCall[0].data.email).toBe("upper@case.com");
  });

  it("returns 409 when email already exists", async () => {
    const mockPrisma = createMockPrisma(["existing@example.com"]);
    const input: RegistrationInput = {
      email: "existing@example.com",
      password: "SecurePass1",
      displayName: "Existing User",
    };

    const result = await registerUser(mockPrisma as any, input);

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe(REGISTRATION_ERRORS.EMAIL_EXISTS);
    expect(result.user).toBeNull();
    expect(result.cookie).toBeNull();
  });

  it("hashes password with bcrypt cost 12", async () => {
    const mockPrisma = createMockPrisma();
    const input: RegistrationInput = {
      email: "hash@test.com",
      password: "HashTest12",
      displayName: "Hash User",
    };

    await registerUser(mockPrisma as any, input);

    const createCall = (mockPrisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const hash = createCall[0].data.passwordHash as string;
    expect(hash).toMatch(/^\$2b\$12\$/);
  });

  it("includes __Host-indie_session in the cookie header", async () => {
    const mockPrisma = createMockPrisma();
    const input: RegistrationInput = {
      email: "cookie@test.com",
      password: "SecurePass1",
      displayName: "Cookie User",
    };

    const result = await registerUser(mockPrisma as any, input);

    expect(result.cookie).toContain("__Host-indie_session=");
    expect(result.cookie).toContain("HttpOnly");
    expect(result.cookie).toContain("Secure");
    expect(result.cookie).toContain("SameSite=Strict");
    expect(result.cookie).toContain("Path=/");
    expect(result.cookie).toContain("Max-Age=604800");
  });

  it("sanitizes passwordHash from the returned user object", async () => {
    const mockPrisma = createMockPrisma();
    const input: RegistrationInput = {
      email: "sanitize@test.com",
      password: "SecurePass1",
      displayName: "Sanitize User",
    };

    const result = await registerUser(mockPrisma as any, input);

    const user = result.user! as Record<string, unknown>;
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");
  });
});

describe("registerUser — error handling (AC3, 4)", () => {
  it("returns 409 on duplicate key constraint from DB layer", async () => {
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(
          new Error("Unique constraint failed on the fields: (`email`)"),
        ),
      },
    };

    const result = await registerUser(
      mockPrisma as unknown as Parameters<typeof registerUser>[0],
      {
        email: "dup@example.com",
        password: "SecurePass1",
        displayName: "Dup User",
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe(REGISTRATION_ERRORS.EMAIL_EXISTS);
  });

  it("returns 500 on unexpected DB error", async () => {
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error("Database connection failed")),
      },
    };

    const result = await registerUser(
      mockPrisma as unknown as Parameters<typeof registerUser>[0],
      {
        email: "error@example.com",
        password: "SecurePass1",
        displayName: "Error User",
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.code).toBe(REGISTRATION_ERRORS.INTERNAL_ERROR);
  });

  it("returns 500 on non-error rejection value", async () => {
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue("string-error"),
      },
    };

    const result = await registerUser(
      mockPrisma as unknown as Parameters<typeof registerUser>[0],
      {
        email: "str@example.com",
        password: "SecurePass1",
        displayName: "Str User",
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                          */
/* ------------------------------------------------------------------ */

describe("registrationSchema — edge cases (AC1)", () => {
  it("handles extra fields in payload (Zod strips them by default)", () => {
    const result = registrationSchema.safeParse({
      email: "extra@test.com",
      password: "Password1a",
      displayName: "Extra User",
      extraField: "should be ignored",
    });

    // Zod v4 strips unknown keys by default in `.object()`
    expect(result.success).toBe(true);
  });

  it("rejects non-string email", () => {
    const result = registrationSchema.safeParse({
      email: 12345 as unknown as string,
      password: "Password1a",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-string displayName", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Password1a",
      displayName: 12345 as unknown as string,
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing displayName", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      password: "Password1a",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = registrationSchema.safeParse({
      email: "valid@test.com",
      displayName: "Test",
    });

    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3 — Error codes are correct                                      */
/* ------------------------------------------------------------------ */

describe("REGISTRATION_ERRORS constants (AC3)", () => {
  it("defines AUTH_EMAIL_EXISTS code", () => {
    expect(REGISTRATION_ERRORS.EMAIL_EXISTS).toBe("AUTH_EMAIL_EXISTS");
  });

  it("defines VALIDATION_FAILED code", () => {
    expect(REGISTRATION_ERRORS.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
  });

  it("defines INTERNAL_ERROR code", () => {
    expect(REGISTRATION_ERRORS.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});

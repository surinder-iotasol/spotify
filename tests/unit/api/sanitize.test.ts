import { describe, it, expect } from "vitest";
import {
  sanitizeRequestBody,
  sanitizeErrorForLogging,
  isSensitiveField,
  SENSITIVE_FIELD_NAMES,
} from "../../../src/lib/api/sanitize";

describe("SENSITIVE_FIELD_NAMES", () => {
  it("includes password and credential field names", () => {
    expect(SENSITIVE_FIELD_NAMES).toContain("password");
    expect(SENSITIVE_FIELD_NAMES).toContain("passwordHash");
    expect(SENSITIVE_FIELD_NAMES).toContain("password_hash");
    expect(SENSITIVE_FIELD_NAMES).toContain("secret");
    expect(SENSITIVE_FIELD_NAMES).toContain("secretKey");
    expect(SENSITIVE_FIELD_NAMES).toContain("secret_key");
    expect(SENSITIVE_FIELD_NAMES).toContain("accessToken");
    expect(SENSITIVE_FIELD_NAMES).toContain("access_token");
    expect(SENSITIVE_FIELD_NAMES).toContain("token");
    expect(SENSITIVE_FIELD_NAMES).toContain("refreshToken");
    expect(SENSITIVE_FIELD_NAMES).toContain("refresh_token");
    expect(SENSITIVE_FIELD_NAMES).toContain("apiKey");
    expect(SENSITIVE_FIELD_NAMES).toContain("api_key");
    expect(SENSITIVE_FIELD_NAMES).toContain("credentials");
  });
});

describe("isSensitiveField", () => {
  it("returns true for sensitive field names", () => {
    expect(isSensitiveField("password")).toBe(true);
    expect(isSensitiveField("secret")).toBe(true);
    expect(isSensitiveField("apiKey")).toBe(true);
    expect(isSensitiveField("token")).toBe(true);
  });

  it("returns false for non-sensitive field names", () => {
    expect(isSensitiveField("name")).toBe(false);
    expect(isSensitiveField("email")).toBe(false);
    expect(isSensitiveField("id")).toBe(false);
    expect(isSensitiveField("createdAt")).toBe(false);
  });
});

describe("sanitizeRequestBody", () => {
  it("redacts password field in top-level object", () => {
    const body = {
      name: "John",
      password: "supersecret123",
      email: "john@example.com",
    };

    const result = sanitizeRequestBody(body) as Record<string, unknown>;
    expect(result).toEqual({
      name: "John",
      password: "[REDACTED]",
      email: "john@example.com",
    });
  });

  it("redacts nested sensitive fields", () => {
    const body = {
      user: {
        name: "Alice",
        credentials: {
          password: "mysecret",
          token: "tok_abc123",
        },
      },
    };

    const result = sanitizeRequestBody(body) as {
      user: { name: string; credentials: { password: string; token: string } };
    };
    expect(result.user.name).toBe("Alice");
    expect(result.user.credentials.password).toBe("[REDACTED]");
    expect(result.user.credentials.token).toBe("[REDACTED]");
  });

  it("handles arrays of objects with sensitive fields", () => {
    const body = {
      users: [
        { name: "Alice", password: "pass1" },
        { name: "Bob", password: "pass2" },
      ],
    };

    const result = sanitizeRequestBody(body) as {
      users: { name: string; password: string }[];
    };
    expect(result.users[0].name).toBe("Alice");
    expect(result.users[0].password).toBe("[REDACTED]");
    expect(result.users[1].name).toBe("Bob");
    expect(result.users[1].password).toBe("[REDACTED]");
  });

  it("passes through non-object values unchanged", () => {
    expect(sanitizeRequestBody(42)).toBe(42);
    expect(sanitizeRequestBody("string")).toBe("string");
    expect(sanitizeRequestBody(null)).toBe(null);
    expect(sanitizeRequestBody(undefined)).toBe(undefined);
    expect(sanitizeRequestBody(true)).toBe(true);
    expect(sanitizeRequestBody(0)).toBe(0);
  });

  it("handles empty objects and arrays", () => {
    expect(sanitizeRequestBody({})).toEqual({});
    expect(sanitizeRequestBody([])).toEqual([]);
  });

  it("handles deeply nested sensitive fields", () => {
    const body = {
      level1: {
        level2: {
          level3: {
            secret: "deep_secret_value",
            apiKey: "key_value",
          },
        },
      },
    };

    const result = sanitizeRequestBody(body) as {
      level1: { level2: { level3: { secret: string; apiKey: string } } };
    };
    expect(result.level1.level2.level3.secret).toBe("[REDACTED]");
    expect(result.level1.level2.level3.apiKey).toBe("[REDACTED]");
  });

  it("does not mutate the original object", () => {
    const body = { name: "Test", password: "secret" };
    const originalPassword = (body as { password: string }).password;

    sanitizeRequestBody(body);

    // The original body should still have the password
    // Actually, sanitizeRequestBody creates a new object, so the original is unchanged
    expect((body as { password: string }).password).toBe(originalPassword);
  });

  it("handles mixed type arrays", () => {
    const body = {
      tags: ["a", "b", null, 42, { password: "secret" }],
    };

    const result = sanitizeRequestBody(body) as {
      tags: (string | null | number | { password: string })[];
    };
    expect(result.tags[0]).toBe("a");
    expect(result.tags[1]).toBe("b");
    expect(result.tags[2]).toBe(null);
    expect(result.tags[3]).toBe(42);
    expect((result.tags[4] as { password: string }).password).toBe("[REDACTED]");
  });
});

describe("sanitizeErrorForLogging", () => {
  it("redacts sensitive fields in error object", () => {
    const error = {
      message: "Validation failed",
      password: "badpassword",
      email: "user@example.com",
    };

    const result = sanitizeErrorForLogging(error) as Record<string, string>;
    expect(result.message).toBe("Validation failed");
    expect(result.password).toBe("[REDACTED]");
    expect(result.email).toBe("user@example.com");
  });

  it("handles nested error objects", () => {
    const error = {
      message: "Auth failed",
      details: {
        passwordHash: "hashed_value",
        secretKey: "key_value",
      },
    };

    const result = sanitizeErrorForLogging(error) as {
      message: string;
      details: { passwordHash: string; secretKey: string };
    };
    expect(result.message).toBe("Auth failed");
    expect(result.details.passwordHash).toBe("[REDACTED]");
    expect(result.details.secretKey).toBe("[REDACTED]");
  });

  it("handles error arrays", () => {
    const error = [
      { message: "err1", password: "pass1" },
      { message: "err2", apiKey: "key1" },
    ];

    const result = sanitizeErrorForLogging(error) as unknown as { message: string; password?: string; apiKey?: string }[];
    expect(result[0].message).toBe("err1");
    expect(result[0].password).toBe("[REDACTED]");
    expect(result[1].message).toBe("err2");
    expect(result[1].apiKey).toBe("[REDACTED]");
  });

  it("handles null errors", () => {
    const result = sanitizeErrorForLogging(null);
    expect(result).toEqual({});
  });

  it("handles non-object errors by wrapping in message", () => {
    expect(sanitizeErrorForLogging("simple error")).toEqual({ message: "simple error" });
    expect(sanitizeErrorForLogging(42)).toEqual({ message: "42" });
    expect(sanitizeErrorForLogging(true)).toEqual({ message: "true" });
  });

  it("handles empty objects", () => {
    const result = sanitizeErrorForLogging({});
    expect(result).toEqual({});
  });

  it("preserves Error instance properties", () => {
    const error = new Error("Database connection failed");
    const result = sanitizeErrorForLogging(error) as { message: string; name?: string; stack?: string };
    expect(result.message).toBe("Database connection failed");
  });

  it("handles Prisma-like error with code and message", () => {
    const error = {
      code: "P2002",
      message: "Unique constraint failed",
      meta: {
        target: ["email", "password"],
      },
    };

    const result = sanitizeErrorForLogging(error) as {
      code: string;
      message: string;
      meta: { target: string[]; password?: string };
    };
    expect(result.code).toBe("P2002");
    expect(result.message).toBe("Unique constraint failed");
    expect(Array.isArray(result.meta.target)).toBe(true);
  });
});

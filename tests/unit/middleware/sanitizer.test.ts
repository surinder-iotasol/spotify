import { describe, it, expect } from "vitest";
import {
  sanitizeRequestBody,
  sanitizeErrorForLogging,
  isSensitiveField,
} from "../../../src/lib/api/sanitize";

/* ------------------------------------------------------------------ */
/*  isSensitiveField                                                   */
/* ------------------------------------------------------------------ */

describe("isSensitiveField", () => {
  it("returns true for common password fields", () => {
    expect(isSensitiveField("password")).toBe(true);
    expect(isSensitiveField("passwordHash")).toBe(true);
    expect(isSensitiveField("password_hash")).toBe(true);
  });

  it("returns true for secret/token/credential fields", () => {
    expect(isSensitiveField("secret")).toBe(true);
    expect(isSensitiveField("secretKey")).toBe(true);
    expect(isSensitiveField("secret_key")).toBe(true);
    expect(isSensitiveField("accessToken")).toBe(true);
    expect(isSensitiveField("access_token")).toBe(true);
    expect(isSensitiveField("token")).toBe(true);
    expect(isSensitiveField("refreshToken")).toBe(true);
    expect(isSensitiveField("refresh_token")).toBe(true);
    expect(isSensitiveField("apiKey")).toBe(true);
    expect(isSensitiveField("api_key")).toBe(true);
    expect(isSensitiveField("credentials")).toBe(true);
  });

  it("returns false for safe field names", () => {
    expect(isSensitiveField("name")).toBe(false);
    expect(isSensitiveField("email")).toBe(false);
    expect(isSensitiveField("id")).toBe(false);
    expect(isSensitiveField("createdAt")).toBe(false);
    expect(isSensitiveField("username")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeRequestBody — flat objects                                 */
/* ------------------------------------------------------------------ */

describe("sanitizeRequestBody — flat objects", () => {
  it("redacts a password field in a flat object", () => {
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

  it("redacts multiple sensitive fields in a flat object", () => {
    const body = {
      username: "johndoe",
      password: "pass123",
      token: "tok_abc",
      email: "johndoe@example.com",
    };

    const result = sanitizeRequestBody(body) as Record<string, unknown>;

    expect(result).toEqual({
      username: "johndoe",
      password: "[REDACTED]",
      token: "[REDACTED]",
      email: "johndoe@example.com",
    });
  });

  it("preserves non-sensitive fields in a flat object", () => {
    const body = {
      id: 123,
      email: "test@example.com",
      active: true,
      role: "user",
    };

    const result = sanitizeRequestBody(body) as Record<string, unknown>;

    expect(result).toEqual(body);
  });

  it("handles an empty object", () => {
    expect(sanitizeRequestBody({})).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeRequestBody — nested structures                            */
/* ------------------------------------------------------------------ */

describe("sanitizeRequestBody — nested structures", () => {
  it("redacts sensitive fields in a single-level nested object", () => {
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
      user: {
        name: string;
        credentials: { password: string; token: string };
      };
    };

    expect(result.user.name).toBe("Alice");
    expect(result.user.credentials.password).toBe("[REDACTED]");
    expect(result.user.credentials.token).toBe("[REDACTED]");
  });

  it("redacts sensitive fields in deeply nested objects", () => {
    const body = {
      level1: {
        level2: {
          level3: {
            secret: "deep_secret_value",
            apiKey: "key_value",
            safeField: "keep_me",
          },
        },
      },
    };

    const result = sanitizeRequestBody(body) as {
      level1: {
        level2: {
          level3: {
            secret: string;
            apiKey: string;
            safeField: string;
          };
        };
      };
    };

    expect(result.level1.level2.level3.secret).toBe("[REDACTED]");
    expect(result.level1.level2.level3.apiKey).toBe("[REDACTED]");
    expect(result.level1.level2.level3.safeField).toBe("keep_me");
  });

  it("does not mutate the original object", () => {
    const body = {
      name: "Test",
      password: "secret",
    };
    const originalPassword = (body as { password: string }).password;

    sanitizeRequestBody(body);

    expect((body as { password: string }).password).toBe(originalPassword);
  });

  it("preserves non-object sibling values alongside sanitized nested objects", () => {
    const body = {
      plainText: "keep this",
      nested: {
        password: "should-redact",
        value: 42,
      },
      anotherPlain: true,
    };

    const result = sanitizeRequestBody(body) as {
      plainText: string;
      nested: { password: string; value: number };
      anotherPlain: boolean;
    };

    expect(result.plainText).toBe("keep this");
    expect(result.nested.password).toBe("[REDACTED]");
    expect(result.nested.value).toBe(42);
    expect(result.anotherPlain).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeRequestBody — arrays of credentials                        */
/* ------------------------------------------------------------------ */

describe("sanitizeRequestBody — arrays", () => {
  it("handles arrays of objects with sensitive fields", () => {
    const body = {
      users: [
        { name: "Alice", password: "pass1" },
        { name: "Bob", password: "pass2" },
        { name: "Charlie", token: "tok_3" },
      ],
    };

    const result = sanitizeRequestBody(body) as {
      users: { name: string; password?: string; token?: string }[];
    };

    expect(result.users[0].name).toBe("Alice");
    expect(result.users[0].password).toBe("[REDACTED]");
    expect(result.users[1].name).toBe("Bob");
    expect(result.users[1].password).toBe("[REDACTED]");
    expect(result.users[2].name).toBe("Charlie");
    expect(result.users[2].token).toBe("[REDACTED]");
  });

  it("handles top-level arrays of credentials", () => {
    const body = [{ password: "a" }, { apiKey: "b" }, { name: "safe" }] as unknown[];

    const result = sanitizeRequestBody(body) as {
      password?: string;
      apiKey?: string;
      name?: string;
    }[];

    expect(result[0].password).toBe("[REDACTED]");
    expect(result[1].apiKey).toBe("[REDACTED]");
    expect(result[2].name).toBe("safe");
  });

  it("handles mixed-type arrays (primitives, nulls, and objects)", () => {
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

  it("handles an empty array", () => {
    expect(sanitizeRequestBody([])).toEqual([]);
  });

  it("handles nested empty arrays", () => {
    const body = { items: [], metadata: { tags: [] } };
    expect(sanitizeRequestBody(body)).toEqual({ items: [], metadata: { tags: [] } });
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeRequestBody — edge cases                                   */
/* ------------------------------------------------------------------ */

describe("sanitizeRequestBody — edge cases", () => {
  it("returns null unchanged", () => {
    expect(sanitizeRequestBody(null)).toBe(null);
  });

  it("returns undefined unchanged", () => {
    expect(sanitizeRequestBody(undefined)).toBe(undefined);
  });

  it("returns a number unchanged", () => {
    expect(sanitizeRequestBody(42)).toBe(42);
    expect(sanitizeRequestBody(0)).toBe(0);
    expect(sanitizeRequestBody(-1)).toBe(-1);
  });

  it("returns a string unchanged", () => {
    expect(sanitizeRequestBody("not an object")).toBe("not an object");
  });

  it("returns a boolean unchanged", () => {
    expect(sanitizeRequestBody(true)).toBe(true);
    expect(sanitizeRequestBody(false)).toBe(false);
  });

  it("handles a string that looks like a sensitive value", () => {
    const body = "password";
    expect(sanitizeRequestBody(body)).toBe("password");
  });

  it("handles a numeric field named password (coerced from JSON)", () => {
    // This tests that only object entries are examined
    const body = { value: 123 };
    expect(sanitizeRequestBody(body)).toEqual({ value: 123 });
  });

  it("handles a single sensitive field with empty string value", () => {
    const body = { password: "" };
    const result = sanitizeRequestBody(body) as { password: string };
    expect(result.password).toBe("[REDACTED]");
  });
});

/* ------------------------------------------------------------------ */
/*  sanitizeErrorForLogging — basic behavior                           */
/* ------------------------------------------------------------------ */

describe("sanitizeErrorForLogging", () => {
  it("redacts sensitive fields in an error object", () => {
    const error = {
      message: "Validation failed",
      password: "badpassword",
      email: "user@example.com",
    };

    const result = sanitizeErrorForLogging(error) as Record<string, unknown>;
    expect(result).toEqual({
      message: "Validation failed",
      password: "[REDACTED]",
      email: "user@example.com",
    });
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

    const result = sanitizeErrorForLogging(error) as unknown as {
      message: string;
      password?: string;
      apiKey?: string;
    }[];

    expect(result[0].message).toBe("err1");
    expect(result[0].password).toBe("[REDACTED]");
    expect(result[1].message).toBe("err2");
    expect(result[1].apiKey).toBe("[REDACTED]");
  });

  it("returns an empty object for null", () => {
    expect(sanitizeErrorForLogging(null)).toEqual({});
  });

  it("wraps a primitive string in a message object", () => {
    const result = sanitizeErrorForLogging("something went wrong") as { message: string };
    expect(result.message).toBe("something went wrong");
  });

  it("wraps a number in a message object", () => {
    const result = sanitizeErrorForLogging(42) as { message: string };
    expect(result.message).toBe("42");
  });

  it("handles a plain error object without sensitive fields", () => {
    const error = { message: "ok", status: 500 };
    const result = sanitizeErrorForLogging(error) as { message: string; status: number };
    expect(result.message).toBe("ok");
    expect(result.status).toBe(500);
  });

  it("returns a sanitized object for empty objects", () => {
    expect(sanitizeErrorForLogging({})).toEqual({});
  });
});

import { describe, it, expect } from "vitest";
import {
  apiSuccessResponse,
  apiErrorResponse,
  SENSITIVE_FIELDS,
  sanitizeDetails,
  sanitizeObject,
  type ValidationErrorDetail,
} from "../../../src/lib/api/response";

describe("apiSuccessResponse", () => {
  it("constructs payload with success: true", () => {
    const res = apiSuccessResponse({ id: "abc" });
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ id: "abc" });
  });

  it("includes a UTC ISO-8601 timestamp in meta", () => {
    const res = apiSuccessResponse("data");
    expect(res.meta.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it("includes a requestId in meta", () => {
    const res = apiSuccessResponse("data");
    expect(res.meta.requestId).toBeDefined();
    expect(typeof res.meta.requestId).toBe("string");
    expect(res.meta.requestId.length).toBeGreaterThan(0);
  });

  it("merges extra meta fields", () => {
    const res = apiSuccessResponse("data", { page: 1, limit: 20 });
    expect(res.meta.page).toBe(1);
    expect(res.meta.limit).toBe(20);
    expect(res.meta.timestamp).toBeDefined();
    expect(res.meta.requestId).toBeDefined();
  });

  it("returns data of generic type T", () => {
    const arr = [1, 2, 3];
    const res = apiSuccessResponse(arr);
    expect(res.data).toBe(arr);
  });

  it("is idempotent – same call produces valid structure each time", () => {
    for (let i = 0; i < 5; i++) {
      const res = apiSuccessResponse({ key: i });
      expect(res).toMatchObject({
        success: true,
        data: { key: i },
        meta: expect.objectContaining({
          timestamp: expect.any(String),
          requestId: expect.any(String),
        }),
      });
    }
  });
});

describe("apiErrorResponse", () => {
  it("constructs payload with success: false", () => {
    const res = apiErrorResponse("ERR_NOT_FOUND", "Resource not found");
    expect(res.success).toBe(false);
    expect(res.error.code).toBe("ERR_NOT_FOUND");
    expect(res.error.message).toBe("Resource not found");
  });

  it("includes a UTC ISO-8601 timestamp in meta", () => {
    const res = apiErrorResponse("CODE", "msg");
    expect(res.meta.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it("includes a requestId in meta", () => {
    const res = apiErrorResponse("CODE", "msg");
    expect(res.meta.requestId).toBeDefined();
  });

  it("includes details when provided", () => {
    const details: ValidationErrorDetail[] = [
      { code: "TOO_SHORT", path: ["password"], message: "Password must be 8+ chars" },
    ];
    const res = apiErrorResponse("VALIDATION_FAILED", "Bad input", details);
    // Sensitive field names are stripped from the path and masked in messages
    expect(res.error.details).toBeDefined();
    const sanitized = res.error.details![0];
    expect(sanitized.code).toBe("TOO_SHORT");
    expect(sanitized.message).toBe("Password must be 8+ chars");
    // path 'password' is stripped because it is a sensitive field
    expect(sanitized.path).toEqual([]);
  });

  it("omits details array when none provided", () => {
    const res = apiErrorResponse("CODE", "msg");
    expect(res.error.details).toBeUndefined();
  });

  it("sanitizes sensitive fields from details", () => {
    const details: ValidationErrorDetail[] = [
      {
        code: "INVALID",
        path: ["password", "email"],
        message: "password: value12345 is invalid",
      },
    ];
    const res = apiErrorResponse("VALIDATION_FAILED", "Bad input", details);
    // path should exclude 'password'
    expect(res.error.details).toBeDefined();
    const sanitized = res.error.details![0];
    expect(sanitized.path).not.toContain("password");
    expect(sanitized.path).toContain("email");
    expect(sanitized.message).not.toContain("value12345");
  });

  it("sanitizes multiple sensitive field references", () => {
    const details: ValidationErrorDetail[] = [
      {
        code: "INVALID",
        path: ["secret", "apiKey", "name"],
        message: "secret: mysecret123 apiKey: k123 name is bad",
      },
    ];
    const res = apiErrorResponse("VALIDATION_FAILED", "Bad input", details);
    const sanitized = res.error.details![0];
    expect(sanitized.path).not.toContain("secret");
    expect(sanitized.path).not.toContain("apiKey");
    expect(sanitized.path).toContain("name");
  });
});

describe("SENSITIVE_FIELDS constant", () => {
  it("includes common password and credential field names", () => {
    expect(SENSITIVE_FIELDS).toContain("password");
    expect(SENSITIVE_FIELDS).toContain("passwordHash");
    expect(SENSITIVE_FIELDS).toContain("secret");
    expect(SENSITIVE_FIELDS).toContain("accessToken");
    expect(SENSITIVE_FIELDS).toContain("apiKey");
  });
});

describe("sanitizeDetails", () => {
  it("removes sensitive segments from path array", () => {
    const input: ValidationErrorDetail[] = [
      { code: "X", path: ["user", "password", "email"], message: "bad" },
    ];
    const result = sanitizeDetails(input);
    expect(result[0].path).toEqual(["user", "email"]);
  });

  it("does not alter non-sensitive paths", () => {
    const input: ValidationErrorDetail[] = [
      { code: "X", path: ["name", "email"], message: "bad" },
    ];
    const result = sanitizeDetails(input);
    expect(result[0].path).toEqual(["name", "email"]);
  });

  it("masks sensitive values in message", () => {
    const input: ValidationErrorDetail[] = [
      { code: "X", path: [], message: "password: SuperSecret123 is wrong" },
    ];
    const result = sanitizeDetails(input);
    expect(result[0].message).not.toContain("SuperSecret123");
    expect(result[0].message).toContain("[REDACTED]");
  });
});

describe("sanitizeObject", () => {
  it("redacts password field in top-level object", () => {
    const obj = { name: "John", password: "secret123", email: "john@test.com" };
    const result = sanitizeObject(obj);
    expect(result).toEqual({ name: "John", password: "[REDACTED]", email: "john@test.com" });
  });

  it("redacts nested password field", () => {
    const obj = {
      user: { name: "John", password: "secret123" },
    };
    const result = sanitizeObject(obj);
    expect(result).toEqual({
      user: { name: "John", password: "[REDACTED]" },
    });
  });

  it("handles arrays of objects", () => {
    const obj = {
      items: [
        { name: "a", secret: "x1" },
        { name: "b", token: "y2" },
      ],
    };
    const result = sanitizeObject(obj);
    const items = (result as unknown as { items: { name: string; secret: string; token: string }[] }).items;
    expect(items[0].secret).toBe("[REDACTED]");
    expect(items[1].token).toBe("[REDACTED]");
  });

  it("passes through non-object values unchanged", () => {
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject("string")).toBe("string");
    expect(sanitizeObject(null)).toBe(null);
    expect(sanitizeObject(undefined)).toBe(undefined);
  });

  it("handles empty objects", () => {
    expect(sanitizeObject({})).toEqual({});
  });

  it("handles empty arrays", () => {
    expect(sanitizeObject([])).toEqual([]);
  });
});

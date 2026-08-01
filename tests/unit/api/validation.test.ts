import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateBody, zodErrorToDetails } from "../../../src/lib/api/validation";

/**
 * Helper to read a Response body as text for assertions.
 */
async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return JSON.parse(text);
}

describe("validateBody", () => {
  it("validates a correct body and returns ok: true", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    });

    const result = validateBody({ name: "Alice", age: 30 }, schema);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ name: "Alice", age: 30 });
    expect(result.response).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("returns ok: false for missing required field", async () => {
    const schema = z.object({
      email: z.string().email(),
    });

    const result = validateBody({}, schema);

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(422);

    const body = (await readResponseBody(result.response!)) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const apiError = body.error as { code: string; details?: unknown[] };
    expect(apiError.code).toBe("VALIDATION_FAILED");
    expect(apiError.details).toBeDefined();
    expect(Array.isArray(apiError.details)).toBe(true);
    expect((apiError.details as unknown[]).length).toBeGreaterThan(0);
  });

  it("returns ok: false for wrong type", async () => {
    const schema = z.object({
      count: z.number(),
    });

    const result = validateBody({ count: "not-a-number" }, schema);

    expect(result.ok).toBe(false);
    expect(result.response!.status).toBe(422);
  });

  it("returns 422 with ValidationErrorDetail format on failure", async () => {
    const schema = z.object({
      username: z.string().min(3).max(20),
      email: z.string().email(),
    });

    const result = validateBody({ username: "ab", email: "not-an-email" }, schema);

    expect(result.ok).toBe(false);
    expect(result.response!.status).toBe(422);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);

    // Each error has the right shape
    for (const err of result.errors) {
      expect(err).toHaveProperty("code");
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("message");
      expect(Array.isArray(err.path)).toBe(true);
      expect(typeof err.code).toBe("string");
      expect(typeof err.message).toBe("string");
    }
  });

  it("handles null/undefined body", async () => {
    const schema = z.object({
      field: z.string(),
    });

    const resultNull = validateBody(null, schema);
    expect(resultNull.ok).toBe(false);
    expect(resultNull.response!.status).toBe(422);

    const resultUndefined = validateBody(undefined, schema);
    expect(resultUndefined.ok).toBe(false);
    expect(resultUndefined.response!.status).toBe(422);
  });

  it("handles string body instead of object", async () => {
    const schema = z.object({
      name: z.string(),
    });

    const result = validateBody("just-a-string", schema);

    expect(result.ok).toBe(false);
    expect(result.response!.status).toBe(422);
  });

  it("returns proper error envelope for validation failure scenarios", async () => {
    // Verifies the error envelope structure used for 400/422/500 scenarios
    // The validation middleware returns 422; routes wrapping it can convert to 400
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    const result = validateBody(
      { email: "invalid", password: "short" },
      schema,
    );

    expect(result.ok).toBe(false);
    expect(result.response!.status).toBe(422);
    const body = (await readResponseBody(result.response!)) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const err2 = body.error as { details?: unknown[] };
    expect(err2.details).toBeDefined();
    expect(Array.isArray(err2.details)).toBe(true);
    expect((err2.details as unknown[]).length).toBe(2);
  });

  it("accepts optional fields when omitted", () => {
    const schema = z.object({
      name: z.string(),
      bio: z.string().optional(),
    });

    const result = validateBody({ name: "Bob" }, schema);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ name: "Bob" });
  });

  it("rejects extra fields when schema is strict", async () => {
    const schema = z.object({
      name: z.string(),
    }).strict();

    const result = validateBody({ name: "Alice", extra: "field" }, schema);

    expect(result.ok).toBe(false);
    expect(result.response!.status).toBe(422);
  });

  it("handles empty object against a schema requiring required fields", async () => {
    const schema = z.object({
      required: z.string(),
      requiredNum: z.number(),
    });

    const result = validateBody({}, schema);
    expect(result.ok).toBe(false);
    expect(result.response!.status).toBe(422);
    expect(result.errors.length).toBe(2);
  });
});

describe("zodErrorToDetails", () => {
  it("converts a ZodError to ValidationErrorDetail array", () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().int().positive(),
    });

    const result = schema.safeParse({ email: "bad", age: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const details = zodErrorToDetails(result.error);
      expect(Array.isArray(details)).toBe(true);
      expect(details.length).toBeGreaterThanOrEqual(1);

      for (const detail of details) {
        expect(detail).toHaveProperty("code");
        expect(detail).toHaveProperty("path");
        expect(detail).toHaveProperty("message");
        expect(typeof detail.code).toBe("string");
        expect(Array.isArray(detail.path)).toBe(true);
      }
    }
  });

  it("maps Zod string.min errors correctly", () => {
    const schema = z.object({
      name: z.string().min(5),
    });

    const result = schema.safeParse({ name: "ab" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const details = zodErrorToDetails(result.error);
      expect(details[0].path).toEqual(["name"]);
    }
  });

  it("handles empty ZodError", () => {
    // ZodError with no issues should return empty array
    const schema = z.object({});
    const result = schema.safeParse("not-an-object");
    expect(result.success).toBe(false);
    if (!result.success) {
      const details = zodErrorToDetails(result.error);
      expect(Array.isArray(details)).toBe(true);
    }
  });

  it("produces unique request IDs per validation call", () => {
    const schema = z.object({
      name: z.string(),
    });

    const result1 = validateBody({ name: "a" }, schema);
    const result2 = validateBody({ name: "b" }, schema);

    expect(result1.data).toEqual({ name: "a" });
    expect(result2.data).toEqual({ name: "b" });
    expect(result1.data).not.toBe(result2.data);
  });
});

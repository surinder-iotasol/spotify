/**
 * STORY-setup-010: Environment variable schema validation using Zod.
 *
 * Parses and validates process.env at server startup, throwing descriptive
 * errors when required variables are missing or invalid.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Schema definition                                                 */
/* ------------------------------------------------------------------ */

const envSchema = z.object({
  /** MongoDB connection URI (e.g. mongodb://localhost:27017/indie_platform) */
  DATABASE_URL: z.string().min(1),

  /** Secret key used for JWT signing (HS256). Must be at least 32 chars. */
  JWT_SECRET: z.string().min(32),

  /** AWS region (e.g. us-east-1) */
  AWS_REGION: z.string().min(1),

  /** AWS access key ID */
  AWS_ACCESS_KEY_ID: z.string().min(1),

  /** AWS secret access key */
  AWS_SECRET_ACCESS_KEY: z.string().min(1),

  /** S3 bucket name for storing audio and image assets */
  S3_BUCKET_NAME: z.string().min(1),

  /** S3 endpoint URL (e.g. https://s3.us-east-1.amazonaws.com or MinIO) */
  S3_ENDPOINT: z.string().min(1),
});

/* ------------------------------------------------------------------ */
/*  Runtime validation                                                */
/* ------------------------------------------------------------------ */

/**
 * Parsed and validated environment configuration.
 */
export interface EnvConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  S3_BUCKET_NAME: string;
  S3_ENDPOINT: string;
}

/**
 * Validate all required environment variables against the Zod schema.
 *
 * This function throws on first validation error with a human-readable
 * message listing every missing or invalid field.
 *
 * @param source - The process.env-like object to validate. Defaults to
 *                 the current process.env to allow testing without monkey-patching.
 * @returns The validated and type-safe EnvConfig record.
 * @throws {Error} When one or more required environment variables are missing
 *                 or fail schema validation.
 */
export function validateEnv(
  source: Record<string, string | undefined> = process.env,
): EnvConfig {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues;
  const lines = issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(
    [
      'Invalid environment variables:',
      ...lines,
      '',
      'See .env.example for the full list of required variables.',
    ].join('\n'),
  );
}

/* ------------------------------------------------------------------ */
/*  Auto-execute on import (Next.js server entry)                      */
/* ------------------------------------------------------------------ */

/**
 * Whether we are running inside a test environment (vitest/jest).
 * Detects common test runner globals to avoid throwing during tests.
 */
const isTestEnv =
  typeof globalThis !== 'undefined' &&
  ((globalThis as Record<string, unknown>).it !== undefined ||
    (globalThis as Record<string, unknown>).describe !== undefined);

/**
 * Called automatically when the module is loaded on the server.
 * Exports the validated config so other modules can import it directly.
 *
 * Skips validation in test environments so that tests can import
 * validateEnv() in isolation with custom env fixtures.
 */
export const env: EnvConfig = isTestEnv
  ? ({} as EnvConfig)
  : validateEnv();

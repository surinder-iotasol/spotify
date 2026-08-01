/**
 * STORY-setup-010: Unit tests for environment variable validation.
 *
 * Verifies that validateEnv():
 * - Returns the correct EnvConfig when all required variables are present
 * - Throws with a descriptive error when required variables are missing
 * - Enforces minimum length constraints (especially JWT_SECRET ≥ 32 chars)
 * - Accepts a custom env source for isolated testing
 */

import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/lib/env';

describe('validateEnv()', () => {
  const validEnv = {
    DATABASE_URL: 'mongodb://localhost:27017/indie_platform',
    JWT_SECRET: 'a'.repeat(32),
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEKEY',
    AWS_SECRET_ACCESS_KEY: 'exampleSecretAccessKey1234567890abcdefghijklmn',
    S3_BUCKET_NAME: 'indie-platform-assets',
    S3_ENDPOINT: 'http://localhost:9000',
  };

  describe('happy path', () => {
    it('returns validated EnvConfig when all required variables are present', () => {
      const result = validateEnv(validEnv);

      expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
      expect(result.JWT_SECRET).toBe(validEnv.JWT_SECRET);
      expect(result.AWS_REGION).toBe(validEnv.AWS_REGION);
      expect(result.AWS_ACCESS_KEY_ID).toBe(validEnv.AWS_ACCESS_KEY_ID);
      expect(result.AWS_SECRET_ACCESS_KEY).toBe(validEnv.AWS_SECRET_ACCESS_KEY);
      expect(result.S3_BUCKET_NAME).toBe(validEnv.S3_BUCKET_NAME);
      expect(result.S3_ENDPOINT).toBe(validEnv.S3_ENDPOINT);
    });

    it('accepts real-world example values from .env.example', () => {
      const exampleEnv = {
        DATABASE_URL: 'mongodb://localhost:27017/mydb',
        JWT_SECRET: 'replace-with-a-long-random-secret-string-that-is-long-enough',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEKEY',
        AWS_SECRET_ACCESS_KEY: 'exampleSecretAccessKey1234567890abcdefghijklmn',
        S3_BUCKET_NAME: 'indie-platform-assets',
        S3_ENDPOINT: 'http://localhost:9000',
      };

      const result = validateEnv(exampleEnv);

      expect(result).toMatchObject(exampleEnv);
    });
  });

  describe('missing variables', () => {
    it('throws when DATABASE_URL is missing', () => {
      const env = { ...validEnv, DATABASE_URL: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when JWT_SECRET is missing', () => {
      const env = { ...validEnv, JWT_SECRET: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when AWS_REGION is missing', () => {
      const env = { ...validEnv, AWS_REGION: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when AWS_ACCESS_KEY_ID is missing', () => {
      const env = { ...validEnv, AWS_ACCESS_KEY_ID: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when AWS_SECRET_ACCESS_KEY is missing', () => {
      const env = { ...validEnv, AWS_SECRET_ACCESS_KEY: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when S3_BUCKET_NAME is missing', () => {
      const env = { ...validEnv, S3_BUCKET_NAME: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when S3_ENDPOINT is missing', () => {
      const env = { ...validEnv, S3_ENDPOINT: undefined as unknown as string };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('throws when all variables are missing', () => {
      expect(() => validateEnv({})).toThrow('Invalid environment variables');
    });

    it('includes missing field names in the error message', () => {
      try {
        validateEnv({});
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain('DATABASE_URL');
        expect(message).toContain('JWT_SECRET');
        expect(message).toContain('AWS_REGION');
      }
    });

    it('includes the helper suggestion in the error message', () => {
      try {
        validateEnv({});
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('.env.example');
      }
    });
  });

  describe('constraint validation', () => {
    it('rejects JWT_SECRET shorter than 32 characters', () => {
      const env = {
        ...validEnv,
        JWT_SECRET: 'short-secret',
      };
      expect(() => validateEnv(env)).toThrow('Invalid environment variables');
    });

    it('accepts JWT_SECRET exactly 32 characters', () => {
      const env = {
        ...validEnv,
        JWT_SECRET: 'a'.repeat(32),
      };
      expect(() => validateEnv(env)).not.toThrow();
    });

    it('accepts JWT_SECRET longer than 32 characters', () => {
      const env = {
        ...validEnv,
        JWT_SECRET: 'a'.repeat(64),
      };
      expect(() => validateEnv(env)).not.toThrow();
    });

    it('rejects empty string for any required field', () => {
      const fields = [
        'DATABASE_URL',
        'JWT_SECRET',
        'AWS_REGION',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'S3_BUCKET_NAME',
        'S3_ENDPOINT',
      ];

      fields.forEach((field) => {
        const env = { ...validEnv, [field]: '' };
        expect(() => validateEnv(env)).toThrow('Invalid environment variables');
      });
    });
  });
});

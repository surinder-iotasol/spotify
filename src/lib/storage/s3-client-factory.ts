/**
 * STORY-setup-005: S3 client creation and presign factory.
 *
 * Extracts S3Client instantiation and presigned URL generation to pure
 * functions so that tests can replace them without ESM constructor issues.
 */
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as _getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from './storage.service';

/**
 * Minimal S3 client interface (supports send + config).
 */
export interface S3ClientLike {
  send: (command: unknown) => Promise<unknown>;
}

/**
 * Create a configured S3Client for the given config.
 */
export function createS3Client(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: config.accessKeyId && config.secretAccessKey
      ? {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        }
      : undefined,
  });
}

/**
 * Generate a presigned URL for S3 operations.
 */
export async function generatePresignedUrl(
  client: S3ClientLike,
  command: unknown,
  options: { expiresIn: number },
): Promise<string> {
  return _getSignedUrl(client as any, command as any, options);
}

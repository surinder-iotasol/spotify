/**
 * STORY-storage-001: Unified StorageProvider Interface for S3 and Cloudflare R2.
 *
 * Abstraction layer utilizing AWS SDK v3 to support Amazon S3 and
 * Cloudflare R2 object storage backends. Dynamically selects the
 * provider implementation based on the STORAGE_PROVIDER environment variable.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from './storage.service';
import { createS3Client } from './s3-client-factory';

// ── TTL Constants ──────────────────────────────────────────────────
const DEFAULT_UPLOAD_TTL = 3600;   // 60 minutes for presigned PUT upload URLs
const DEFAULT_DOWNLOAD_TTL = 900;  // 15 minutes for presigned GET download URLs
const MAX_TTL = 3600;              // Absolute cap for all presigned URLs

// ── Interfaces ─────────────────────────────────────────────────────

/**
 * Metadata returned when retrieving object information.
 */
export interface ObjectMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
  eTag: string;
}

/**
 * Configuration for a StorageProvider.
 */
export interface StorageProviderConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Unified StorageProvider interface for object storage operations.
 * Exposes a consistent API over S3 and R2 backends.
 */
export interface StorageProvider {
  /** Generate a presigned URL for uploading (PUT) an object. */
  generatePresignedUploadUrl(
    key: string,
    options?: { ttl?: number; contentType?: string },
  ): Promise<string>;

  /** Generate a presigned URL for downloading (GET) an object. */
  generatePresignedDownloadUrl(
    key: string,
    options?: { ttl?: number },
  ): Promise<string>;

  /** Delete an object from storage. */
  deleteObject(key: string): Promise<void>;

  /** Retrieve metadata (head object) for a given key. */
  getObjectMetadata(key: string): Promise<ObjectMetadata>;
}

/**
 * S3StorageProvider implementation for Amazon S3 object storage.
 */
export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageProviderConfig) {
    this.bucket = config.bucket;
    this.client = createS3Client(config as StorageConfig);
  }

  async generatePresignedUploadUrl(
    key: string,
    options?: { ttl?: number; contentType?: string },
  ): Promise<string> {
    const ttl = Math.min(
      (options?.ttl ?? DEFAULT_UPLOAD_TTL),
      MAX_TTL,
    );

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.contentType ? { ContentType: options.contentType } : {}),
    });

    return getSignedUrl(this.client, command, { expiresIn: ttl });
  }

  async generatePresignedDownloadUrl(
    key: string,
    options?: { ttl?: number },
  ): Promise<string> {
    const ttl = Math.min(
      (options?.ttl ?? DEFAULT_DOWNLOAD_TTL),
      MAX_TTL,
    );

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttl });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async getObjectMetadata(key: string): Promise<ObjectMetadata> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType ?? '',
      lastModified: response.LastModified ?? new Date(),
      eTag: (response.ETag as string | undefined)?.replace(/^"|"$/g, '') ?? '',
    };
  }
}

/**
 * R2StorageProvider implementation for Cloudflare R2 object storage.
 *
 * R2 is S3-compatible; the only difference from S3 is the default
 * endpoint URL. Both use the same AWS SDK v3 S3Client under the hood.
 */
export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageProviderConfig) {
    this.bucket = config.bucket;
    // R2 requires a custom endpoint; region defaults to "auto" for R2
    const region = config.region || 'auto';
    this.client = createS3Client({
      ...config,
      region,
    } as StorageConfig);
  }

  async generatePresignedUploadUrl(
    key: string,
    options?: { ttl?: number; contentType?: string },
  ): Promise<string> {
    const ttl = Math.min(
      (options?.ttl ?? DEFAULT_UPLOAD_TTL),
      MAX_TTL,
    );

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.contentType ? { ContentType: options.contentType } : {}),
    });

    return getSignedUrl(this.client, command, { expiresIn: ttl });
  }

  async generatePresignedDownloadUrl(
    key: string,
    options?: { ttl?: number },
  ): Promise<string> {
    const ttl = Math.min(
      (options?.ttl ?? DEFAULT_DOWNLOAD_TTL),
      MAX_TTL,
    );

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttl });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async getObjectMetadata(key: string): Promise<ObjectMetadata> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType ?? '',
      lastModified: response.LastModified ?? new Date(),
      eTag: (response.ETag as string | undefined)?.replace(/^"|"$/g, '') ?? '',
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────

/**
 * Create a StorageProvider instance based on the STORAGE_PROVIDER
 * environment variable ('s3' or 'r2'), or an explicit type override.
 *
 * @param config  Storage configuration (bucket, region, endpoint, credentials).
 * @param type    Explicit provider type override ('s3' | 'r2'). Defaults to
 *                the STORAGE_PROVIDER environment variable.
 */
export function createStorageProvider(
  config: StorageProviderConfig,
  type?: 's3' | 'r2',
): StorageProvider {
  const provider = type ?? (process.env.STORAGE_PROVIDER as 's3' | 'r2' | undefined);

  switch (provider) {
    case 'r2':
      return new R2StorageProvider(config);
    case 's3':
    default:
      return new S3StorageProvider(config);
  }
}

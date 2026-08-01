/**
 * STORY-setup-005: StorageService interface and S3StorageService implementation.
 *
 * Vendor-agnostic storage abstraction wrapping @aws-sdk/client-s3.
 * Supports AWS S3 and Cloudflare R2 compatible endpoints.
 */
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createS3Client, generatePresignedUrl, type S3ClientLike } from './s3-client-factory';

// TTL constants (in seconds)
const UPLOAD_URL_TTL = 3600;    // 60 minutes for PUT upload URLs
const STREAM_URL_TTL = 900;     // 15 minutes for GET streaming URLs
const MAX_TTL = 3600;           // Absolute cap for getObject streaming requests

// Presigner function type for injection
export type PresignerFn = (
  client: S3ClientLike,
  command: unknown,
  options: { expiresIn: number },
) => Promise<string>;

/**
 * Configuration for S3 storage operations.
 */
export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Result of an object upload.
 */
export interface UploadResult {
  eTag: string;
}

/**
 * Operation type for signed URL generation.
 */
export type SignedUrlOperation = 'PUT' | 'GET';

/**
 * StorageService interface for vendor-agnostic storage operations.
 */
export interface StorageService {
  uploadObject(key: string, body: Buffer, contentType: string): Promise<UploadResult>;
  deleteObject(key: string): Promise<void>;
  generateSignedUrl(key: string, operation: SignedUrlOperation, contentType?: string): Promise<string>;
}

/**
 * S3StorageService implementation for AWS S3 and Cloudflare R2 compatible endpoints.
 * Accepts an optional S3Client for testability.
 */
export class S3StorageService implements StorageService {
  private client: S3ClientLike;
  private bucket: string;
  private presignerFn: PresignerFn;

  constructor(config: StorageConfig, client?: S3ClientLike) {
    this.bucket = config.bucket;
    this.client = client ?? createS3Client(config) as S3ClientLike;
    this.presignerFn = generatePresignedUrl;
  }

  /**
   * Upload an object to S3 storage.
   */
  async uploadObject(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    const response = await this.client.send(command);
    const etag = (response as Record<string, unknown>)?.ETag;
    return { eTag: (typeof etag === 'string') ? etag : '' };
  }

  /**
   * Delete an object from S3 storage.
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Generate a presigned URL for S3 operations.
   * Enforces a 3600-second (1 hour) TTL cap for getObject streaming requests.
   */
  async generateSignedUrl(
    key: string,
    operation: SignedUrlOperation,
    contentType?: string,
  ): Promise<string> {
    const command =
      operation === 'PUT'
        ? new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ...(contentType ? { ContentType: contentType } : {}),
          })
        : new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
          });

    // Determine TTL based on operation type, capped at MAX_TTL
    const ttl = operation === 'GET' ? Math.min(STREAM_URL_TTL, MAX_TTL) : UPLOAD_URL_TTL;

    return this.presignerFn(this.client, command, { expiresIn: ttl });
  }
}

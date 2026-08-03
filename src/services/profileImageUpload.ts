/**
 * STORY-profile-003: Profile image upload service.
 *
 * Provides image file validation, key generation, and upload orchestration
 * for avatar and header images on artist profiles.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Maximum allowed image file size: 5 MB in bytes. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types for profile images. */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/* ------------------------------------------------------------------ */
/*  Error codes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Profile image-specific error codes.
 */
export const PROFILE_IMAGE_ERRORS = {
  INVALID_AVATAR_URL: "INVALID_AVATAR_URL",
  INVALID_HEADER_URL: "INVALID_HEADER_URL",
  SIZE_LIMIT_EXCEEDED: "SIZE_LIMIT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Result of image file validation.
 */
export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  data?: void;
  error?: ValidationError;
}

/**
 * Storage provider interface for upload orchestration.
 */
export interface StorageProvider {
  uploadObject(key: string, body: Buffer, contentType: string): Promise<{ eTag: string }>;
}

/**
 * Prisma-like artist profile repository for updates.
 */
export interface ArtistProfileRepository {
  findUnique: (args: { where: { userId: string } }) => Promise<Record<string, unknown> | null>;
  update: (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
}

/**
 * Response shape for avatar/header upload endpoints.
 */
export interface ProfileImageUploadResponse {
  id: string;
  stageName: string;
  bio: string | null;
  avatarUrl: string | null;
  headerImageUrl: string | null;
  socialLinks: unknown[] | null;
  isVerified: boolean;
}

/* ------------------------------------------------------------------ */
/*  Upload orchestration                                              */
/* ------------------------------------------------------------------ */

/**
 * Upload a profile image: validate, store in cloud storage, and update the ArtistProfile.
 *
 * @param buffer       - Raw image buffer from the multipart upload.
 * @param mimeType     - MIME type of the uploaded image.
 * @param uploadType   - "avatar" or "header".
 * @param userId       - The authenticated artist's user ID.
 * @param repository   - ArtistProfile repository for DB updates.
 * @param storage      - Storage provider for cloud uploads.
 * @returns Updated profile record on success.
 * @throws Error with code matching the appropriate INVALID_*_URL or INTERNAL_ERROR.
 */
export async function uploadProfileImage(
  buffer: Buffer,
  mimeType: string,
  uploadType: "avatar" | "header",
  userId: string,
  repository: ArtistProfileRepository,
  storage: StorageProvider,
): Promise<ProfileImageUploadResponse> {
  // 1. Validate the image file
  const validation = validateImageFile(buffer, uploadType, mimeType);
  if (!validation.ok) {
    throw { code: validation.error.code, message: validation.error.message };
  }

  // 2. Find the artist profile
  const profile = await repository.findUnique({ where: { userId } });
  if (!profile) {
    throw {
      code: "ARTIST_PROFILE_NOT_FOUND",
      message: "Artist profile not found. Upgrade to artist role first.",
    };
  }

  // 3. Generate a unique S3 key and upload
  const uploadKey = generateUploadKey(uploadType, userId, profile.id);
  const contentType = mimeType;
  await storage.uploadObject(uploadKey, buffer, contentType);

  // 4. Build the HTTPS asset URL (S3/R2 convention)
  const assetUrl = `https://${uploadKey}`;

  // 5. Update the ArtistProfile record
  const fieldMap: Record<string, string> =
    uploadType === "avatar" ? { avatarUrl: assetUrl } : { headerImageUrl: assetUrl };

  const updated = await repository.update({
    where: { id: profile.id },
    data: fieldMap,
  });

  return {
    id: updated.id,
    stageName: updated.stageName,
    bio: updated.bio,
    avatarUrl: updated.avatarUrl,
    headerImageUrl: updated.headerImageUrl,
    socialLinks: updated.socialLinks,
    isVerified: updated.isVerified,
  };
};

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Validate an image file buffer for size and MIME type.
 *
 * @param buffer    - The raw image buffer.
 * @param uploadType - Either "avatar" or "header" to determine the error code.
 * @param mimeType  - Optional MIME type override (useful when testing with mock buffers).
 * @returns Ok result for valid files, or an error with the appropriate code.
 */
export function validateImageFile(
  buffer: Buffer,
  uploadType: "avatar" | "header",
  mimeType?: string,
): ValidationResult {
  // Check file size
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    const code = uploadType === "avatar"
      ? PROFILE_IMAGE_ERRORS.INVALID_AVATAR_URL
      : PROFILE_IMAGE_ERRORS.INVALID_HEADER_URL;
    return {
      ok: false,
      error: {
        code,
        message: `Image file exceeds ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit.`,
      },
    };
  }

  // Check MIME type
  const fileType = mimeType ?? "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(fileType)) {
    const code = uploadType === "avatar"
      ? PROFILE_IMAGE_ERRORS.INVALID_AVATAR_URL
      : PROFILE_IMAGE_ERRORS.INVALID_HEADER_URL;
    return {
      ok: false,
      error: {
        code,
        message: `Unsupported image type: ${fileType}. Allowed types: JPEG, PNG, WebP.`,
      },
    };
  }

  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------------ */
/*  Key generation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generate a unique S3 key for storing a profile image.
 *
 * @param uploadType - Either "avatar" or "header".
 * @param userId     - The artist's user ID.
 * @param fileId     - A unique file identifier (e.g., UUID).
 * @returns A path like "avatars/user-123/file-456-1234567890123.jpg".
 */
export function generateUploadKey(
  uploadType: "avatar" | "header",
  userId: string,
  fileId: string,
): string {
  const prefix = uploadType === "avatar" ? "avatars" : "headers";
  const timestamp = Date.now();
  return `${prefix}/${userId}/${fileId}-${timestamp}`;
}

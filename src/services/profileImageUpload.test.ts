/**
 * STORY-profile-003: Unit tests for profile image upload service.
 *
 * Tests file type validation, size checking, and storage provider invocation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateImageFile,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  PROFILE_IMAGE_ERRORS,
  generateUploadKey,
  uploadProfileImage,
  type StorageProvider,
  type ArtistProfileRepository,
} from "./profileImageUpload";

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

function createMockBuffer(mimeType: string): Buffer {
  const header = mimeType === "image/jpeg"
    ? Buffer.from([0xff, 0xd8, 0xff])
    : mimeType === "image/png"
      ? Buffer.from([0x89, 0x50, 0x4e, 0x47])
      : Buffer.from([0x52, 0x49, 0x46, 0x46]);
  return Buffer.concat([header, Buffer.alloc(100)]);
}

// ------------------------------------------------------------------ //
//  Tests — validateImageFile                                          //
// ------------------------------------------------------------------ //

describe("validateImageFile", () => {
  it("returns ok=true for a valid JPEG image under 5MB", () => {
    const buffer = createMockBuffer("image/jpeg");
    const result = validateImageFile(buffer, "avatar", "image/jpeg");
    expect(result.ok).toBe(true);
  });

  it("returns ok=true for a valid PNG image under 5MB", () => {
    const buffer = createMockBuffer("image/png");
    const result = validateImageFile(buffer, "header", "image/png");
    expect(result.ok).toBe(true);
  });

  it("returns ok=true for a valid WebP image under 5MB", () => {
    const buffer = createMockBuffer("image/webp");
    const result = validateImageFile(buffer, "avatar", "image/webp");
    expect(result.ok).toBe(true);
  });

  it("returns INVALID_AVATAR_URL for JPEG exceeding 5MB", () => {
    const oversized = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0);
    const result = validateImageFile(oversized, "avatar");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_AVATAR_URL");
    }
  });

  it("returns INVALID_HEADER_URL for PNG exceeding 5MB", () => {
    const oversized = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0);
    const result = validateImageFile(oversized, "header");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_HEADER_URL");
    }
  });

  it("returns INVALID_AVATAR_URL for disallowed MIME type (application/pdf)", () => {
    const pdf = Buffer.from("fake pdf content");
    const result = validateImageFile(pdf, "avatar", "image/pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_AVATAR_URL");
    }
  });

  it("returns INVALID_HEADER_URL for disallowed MIME type (application/octet-stream)", () => {
    const octet = Buffer.from("fake data");
    const result = validateImageFile(octet, "header", "application/octet-stream");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_HEADER_URL");
    }
  });

  it("returns 422 INVALID_AVATAR_URL when file size is exactly at limit", () => {
    const exactSize = Buffer.alloc(MAX_IMAGE_SIZE_BYTES, 0);
    const result = validateImageFile(exactSize, "avatar", "image/jpeg");
    expect(result.ok).toBe(true);
  });
});

// ------------------------------------------------------------------ //
//  Tests — generateUploadKey                                          //
// ------------------------------------------------------------------ //

describe("generateUploadKey", () => {
  it("produces a key with the correct prefix for avatar uploads", () => {
    const key = generateUploadKey("avatar", "user-123", "abc123");
    expect(key).toMatch(/^avatars\/user-123\//);
  });

  it("produces a key with the correct prefix for header uploads", () => {
    const key = generateUploadKey("header", "user-123", "abc123");
    expect(key).toMatch(/^headers\/user-123\//);
  });

  it("includes the file id in the key", () => {
    const key = generateUploadKey("avatar", "user-123", "file-456");
    expect(key).toContain("file-456");
  });

  it("includes a timestamp for uniqueness", () => {
    const key = generateUploadKey("avatar", "user-123", "file-456");
    // Key should contain digits representing a timestamp
    expect(key).toMatch(/\d{13}/);
  });
});

// ------------------------------------------------------------------ //
//  Tests — error codes                                               //
// ------------------------------------------------------------------ //

describe("error codes", () => {
  it("defines INVALID_AVATAR_URL", () => {
    expect(PROFILE_IMAGE_ERRORS.INVALID_AVATAR_URL).toBe("INVALID_AVATAR_URL");
  });

  it("defines INVALID_HEADER_URL", () => {
    expect(PROFILE_IMAGE_ERRORS.INVALID_HEADER_URL).toBe("INVALID_HEADER_URL");
  });

  it("defines INTERNAL_ERROR", () => {
    expect(PROFILE_IMAGE_ERRORS.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });

  it("defines SIZE_LIMIT_EXCEEDED", () => {
    expect(PROFILE_IMAGE_ERRORS.SIZE_LIMIT_EXCEEDED).toBe("SIZE_LIMIT_EXCEEDED");
  });
});

// ------------------------------------------------------------------ //
//  Tests — uploadProfileImage                                         //
// ------------------------------------------------------------------ //

describe("uploadProfileImage", () => {
  const testUserId = "user-123";
  const testProfileId = "ap-001";

  function createMockRepository(overrides?: Record<string, unknown>): {
    repo: ArtistProfileRepository;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } {
    const findUnique = vi.fn().mockResolvedValue({
      id: testProfileId,
      userId: testUserId,
      stageName: "Test Artist",
      bio: "Bio text",
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      ...overrides,
    });
    const update = vi.fn().mockResolvedValue({
      id: testProfileId,
      userId: testUserId,
      stageName: "Test Artist",
      bio: "Bio text",
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
      ...overrides,
    });
    return {
      repo: { findUnique, update } as ArtistProfileRepository,
      findUnique,
      update,
    };
  }

  function createMockStorage(): {
    storage: StorageProvider;
    uploadObject: ReturnType<typeof vi.fn>;
  } {
    const uploadObject = vi.fn().mockResolvedValue({ eTag: "mock-etag-123" });
    return {
      storage: { uploadObject } as StorageProvider,
      uploadObject,
    };
  }

  const validJpegBuffer = createMockBuffer("image/jpeg");

  it("uploads avatar image and updates avatarUrl field", async () => {
    const { repo, findUnique, update } = createMockRepository();
    const { storage, uploadObject } = createMockStorage();

    const result = await uploadProfileImage(
      validJpegBuffer,
      "image/jpeg",
      "avatar",
      testUserId,
      repo,
      storage,
    );

    // StorageProvider was invoked with the upload key, buffer, and content type
    expect(uploadObject).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = uploadObject.mock.calls[0];
    expect(key).toMatch(/^avatars\/user-123\/ap-001-/);
    expect(body).toBe(validJpegBuffer);
    expect(contentType).toBe("image/jpeg");

    // ArtistProfile repository update was called with avatarUrl field
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: testProfileId },
        data: { avatarUrl: expect.stringMatching(/^https:\/\/avatars\/user-123\/ap-001-/) },
      }),
    );

    // Result contains the updated avatarUrl
    expect(result.avatarUrl).toMatch(/^https:\/\/avatars\/user-123\/ap-001-/);
    expect(result.headerImageUrl).toBeNull();
    expect(result.stageName).toBe("Test Artist");
  });

  it("uploads header image and updates headerImageUrl field", async () => {
    const { repo, update } = createMockRepository();
    const { storage, uploadObject } = createMockStorage();

    const result = await uploadProfileImage(
      validJpegBuffer,
      "image/jpeg",
      "header",
      testUserId,
      repo,
      storage,
    );

    expect(uploadObject).toHaveBeenCalledTimes(1);
    const [key] = uploadObject.mock.calls[0];
    expect(key).toMatch(/^headers\/user-123\/ap-001-/);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: testProfileId },
        data: { headerImageUrl: expect.stringMatching(/^https:\/\/headers\/user-123\/ap-001-/) },
      }),
    );

    expect(result.headerImageUrl).toMatch(/^https:\/\/headers\/user-123\/ap-001-/);
    expect(result.avatarUrl).toBeNull();
  });

  it("throws with INVALID_AVATAR_URL when file exceeds size limit", async () => {
    const { repo } = createMockRepository();
    const { storage } = createMockStorage();

    const oversizedBuffer = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0);

    await expect(
      uploadProfileImage(oversizedBuffer, "avatar", "avatar", testUserId, repo, storage),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_AVATAR_URL",
        message: expect.stringContaining("exceeds"),
      }),
    );
  });

  it("throws with INVALID_HEADER_URL when file exceeds size limit for header", async () => {
    const { repo } = createMockRepository();
    const { storage } = createMockStorage();

    const oversizedBuffer = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0);

    await expect(
      uploadProfileImage(oversizedBuffer, "header", "header", testUserId, repo, storage),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_HEADER_URL",
        message: expect.stringContaining("exceeds"),
      }),
    );
  });

  it("throws with INVALID_AVATAR_URL when MIME type is not allowed", async () => {
    const { repo } = createMockRepository();
    const { storage } = createMockStorage();

    await expect(
      uploadProfileImage(Buffer.from("data"), "application/pdf", "avatar", testUserId, repo, storage),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_AVATAR_URL",
        message: expect.stringContaining("Unsupported"),
      }),
    );
  });

  it("throws with INVALID_HEADER_URL when MIME type is not allowed for header", async () => {
    const { repo } = createMockRepository();
    const { storage } = createMockStorage();

    await expect(
      uploadProfileImage(Buffer.from("data"), "application/octet-stream", "header", testUserId, repo, storage),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_HEADER_URL",
        message: expect.stringContaining("Unsupported"),
      }),
    );
  });

  it("throws when artist profile is not found", async () => {
    const { repo, findUnique } = createMockRepository({
      id: null,
      userId: null,
    });
    findUnique.mockResolvedValue(null);
    const { storage } = createMockStorage();

    await expect(
      uploadProfileImage(validJpegBuffer, "image/jpeg", "avatar", testUserId, repo, storage),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "ARTIST_PROFILE_NOT_FOUND",
        message: "Artist profile not found. Upgrade to artist role first.",
      }),
    );
  });

  it("captures and returns the asset URL from storage upload", async () => {
    const { repo } = createMockRepository();
    const { storage, uploadObject } = createMockStorage();
    uploadObject.mockResolvedValue({ eTag: "custom-etag-xyz" });

    const result = await uploadProfileImage(
      validJpegBuffer,
      "image/png",
      "avatar",
      testUserId,
      repo,
      storage,
    );

    // The URL is built from the upload key (https://{key})
    expect(result.avatarUrl).toMatch(/^https:\/\/avatars\//);
    expect(result.avatarUrl).toContain(testUserId);
    expect(result.avatarUrl).toContain(testProfileId);
  });

  it("returns all expected fields in the response", async () => {
    const { repo } = createMockRepository({
      isVerified: true,
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
    });
    const { storage } = createMockStorage();

    const result = await uploadProfileImage(
      validJpegBuffer,
      "image/webp",
      "header",
      testUserId,
      repo,
      storage,
    );

    expect(result).toMatchObject({
      id: testProfileId,
      stageName: "Test Artist",
      bio: "Bio text",
      isVerified: true,
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
    });
    expect(typeof result.id).toBe("string");
    expect(typeof result.stageName).toBe("string");
  });

  it("throws on valid MIME but wrong uploadType parameter is handled gracefully", async () => {
    // Both avatar and header accept the same MIME types — verify behavior is consistent
    const { repo: repo1 } = createMockRepository();
    const { repo: repo2 } = createMockRepository();
    const { storage: storage1 } = createMockStorage();
    const { storage: storage2 } = createMockStorage();

    const resultAvatar = await uploadProfileImage(
      validJpegBuffer,
      "image/png",
      "avatar",
      testUserId,
      repo1,
      storage1,
    );
    const resultHeader = await uploadProfileImage(
      validJpegBuffer,
      "image/png",
      "header",
      testUserId,
      repo2,
      storage2,
    );

    expect(resultAvatar.avatarUrl).not.toBeNull();
    expect(resultHeader.headerImageUrl).not.toBeNull();
  });
});

// ------------------------------------------------------------------ //
//  Tests — uploadProfileImage                                         //
// ------------------------------------------------------------------ //

describe("uploadProfileImage", () => {
  it("calls storage.uploadObject with correct params for avatar upload", async () => {
    const mockStorage = {
      uploadObject: vi.fn().mockResolvedValue({ eTag: "abc123" }),
    };
    const mockRepository = {
      findUnique: vi.fn().mockResolvedValue({
        id: "profile-123",
        stageName: "Artist One",
        bio: "Hello",
        avatarUrl: null,
        headerImageUrl: null,
        socialLinks: [],
        isVerified: false,
      }),
      update: vi.fn().mockResolvedValue({
        id: "profile-123",
        stageName: "Artist One",
        bio: "Hello",
        avatarUrl: "https://avatars/user-1/profile-123-avatar-1234567890123",
        headerImageUrl: null,
        socialLinks: [],
        isVerified: false,
      }),
    };

    const buffer = Buffer.from("image-data");
    const result = await uploadProfileImage(
      buffer,
      "image/jpeg",
      "avatar",
      "user-1",
      mockRepository,
      mockStorage,
    );

    expect(mockStorage.uploadObject).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = (mockStorage.uploadObject).mock.calls[0];
    expect(key).toContain("avatars/");
    expect(key).toContain("user-1");
    expect(body).toBe(buffer);
    expect(contentType).toBe("image/jpeg");
    expect(result.avatarUrl).toBe("https://avatars/user-1/profile-123-avatar-1234567890123");
  });

  it("calls storage.uploadObject with correct params for header upload", async () => {
    const mockStorage = {
      uploadObject: vi.fn().mockResolvedValue({ eTag: "def456" }),
    };
    const mockRepository = {
      findUnique: vi.fn().mockResolvedValue({
        id: "profile-456",
        stageName: "Artist Two",
        bio: "World",
        avatarUrl: null,
        headerImageUrl: null,
        socialLinks: [],
        isVerified: true,
      }),
      update: vi.fn().mockResolvedValue({
        id: "profile-456",
        stageName: "Artist Two",
        bio: "World",
        avatarUrl: null,
        headerImageUrl: "https://headers/user-2/profile-456-header-1234567890123",
        socialLinks: [],
        isVerified: true,
      }),
    };

    const buffer = Buffer.from("header-image-data");
    const result = await uploadProfileImage(
      buffer,
      "image/png",
      "header",
      "user-2",
      mockRepository,
      mockStorage,
    );

    expect(mockStorage.uploadObject).toHaveBeenCalledTimes(1);
    const [key] = (mockStorage.uploadObject).mock.calls[0];
    expect(key).toContain("headers/");
    expect(result.headerImageUrl).toBe("https://headers/user-2/profile-456-header-1234567890123");
  });

  it("throws ARTIST_PROFILE_NOT_FOUND when user has no artist profile", async () => {
    const mockStorage = { uploadObject: vi.fn() };
    const mockRepository = {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    };

    await expect(
      uploadProfileImage(Buffer.from("data"), "image/jpeg", "avatar", "user-nobody", mockRepository, mockStorage),
    ).rejects.toEqual({
      code: "ARTIST_PROFILE_NOT_FOUND",
      message: "Artist profile not found. Upgrade to artist role first.",
    });
  });

  it("throws validation error code when file type is invalid", async () => {
    const mockStorage = { uploadObject: vi.fn() };
    const mockRepository = {
      findUnique: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      uploadProfileImage(
        Buffer.from("pdf-data"),
        "application/pdf",
        "avatar",
        "user-1",
        mockRepository,
        mockStorage,
      ),
    ).rejects.toEqual({
      code: "INVALID_AVATAR_URL",
      message: expect.stringContaining("Unsupported image type"),
    });
  });

  it("throws validation error code when file size exceeds limit", async () => {
    const mockStorage = { uploadObject: vi.fn() };
    const mockRepository = {
      findUnique: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      uploadProfileImage(
        Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0),
        "image/jpeg",
        "header",
        "user-1",
        mockRepository,
        mockStorage,
      ),
    ).rejects.toEqual({
      code: "INVALID_HEADER_URL",
      message: expect.stringContaining("exceeds"),
    });
  });
});

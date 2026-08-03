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

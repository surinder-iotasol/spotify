/**
 * STORY-profile-003a: Unit tests for multipart image upload middleware.
 *
 * Tests file parsing, size limits (5 MB), MIME type validation (jpeg/png/webp),
 * and error response codes (INVALID_AVATAR_URL / INVALID_HEADER_URL).
 */

import { describe, it, expect, vi } from "vitest";
import { parseMultipartImage } from "./multipartUpload";

// ------------------------------------------------------------------ //
//  Global File mock — jsdom does not provide the File constructor     //
// ------------------------------------------------------------------ //

if (typeof globalThis.File !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  globalThis.File = class File {
    constructor(
      public chunks: unknown[],
      public name: string,
      public options: { type: string },
    ) {}
  } as unknown as typeof File;
}

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

/**
 * Create a File-like object with the given MIME type and byte size.
 * Uses Blob in jsdom (which provides Blob.arrayBuffer) cast to File.
 */
function createMockFile(mimeType: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type: mimeType });
  return blob as unknown as File;
}

/**
 * Create a mock NextRequest-like object for the middleware.
 * FormData is built manually via `append()` to work in jsdom.
 */
function createRequest(formData: Map<string, unknown>, contentType: string): Parameters<typeof parseMultipartImage>[0] {
  const fd = new FormData();
  for (const [key, value] of formData.entries()) {
    fd.append(key, value as Blob);
  }

  return {
    headers: {
      get: (key: string) => {
        if (key === "content-type") return contentType;
        return null;
      },
    },
    formData: async () => fd,
  };
}

// ------------------------------------------------------------------ //
//  Tests — parsing multipart requests                                 //
// ------------------------------------------------------------------ //

describe("parseMultipartImage — parsing", () => {
  it("returns parsed image file for a valid JPEG upload (avatar)", async () => {
    const file = createMockFile("image/jpeg", 1024);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=----WebKitFormBoundary");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) {
      throw new Error("Expected parsed result, got Response");
    }
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBe(1024);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("returns parsed image file for a valid PNG upload (header)", async () => {
    const file = createMockFile("image/png", 2048);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=----boundary");

    const result = await parseMultipartImage(request, "header");

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("Expected parsed result");
    expect(result.mimeType).toBe("image/png");
  });

  it("returns parsed image file for a valid WebP upload", async () => {
    const file = createMockFile("image/webp", 512);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("Expected parsed result");
    expect(result.mimeType).toBe("image/webp");
  });
});

// ------------------------------------------------------------------ //
//  Tests — size enforcement                                           //
// ------------------------------------------------------------------ //

describe("parseMultipartImage — size enforcement", () => {
  it("returns 422 INVALID_AVATAR_URL for file exceeding 5 MB", async () => {
    const fiveMIB = 5 * 1024 * 1024;
    const oversized = createMockFile("image/jpeg", fiveMIB + 1);
    const formData = new Map<string, unknown>([["file", oversized]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 422 INVALID_HEADER_URL for file exceeding 5 MB", async () => {
    const fiveMIB = 5 * 1024 * 1024;
    const oversized = createMockFile("image/png", fiveMIB + 1);
    const formData = new Map<string, unknown>([["file", oversized]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "header");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_HEADER_URL");
  });

  it("allows file exactly at the 5 MB limit", async () => {
    const fiveMIB = 5 * 1024 * 1024;
    const exact = createMockFile("image/jpeg", fiveMIB);
    const formData = new Map<string, unknown>([["file", exact]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("Expected parsed result");
    expect(result.buffer.length).toBe(fiveMIB);
  });
});

// ------------------------------------------------------------------ //
//  Tests — MIME type validation                                       //
// ------------------------------------------------------------------ //

describe("parseMultipartImage — MIME type validation", () => {
  it("accepts image/jpeg", async () => {
    const file = createMockFile("image/jpeg", 100);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("Expected parsed result");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("accepts image/png", async () => {
    const file = createMockFile("image/png", 100);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "header");
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("Expected parsed result");
    expect(result.mimeType).toBe("image/png");
  });

  it("accepts image/webp", async () => {
    const file = createMockFile("image/webp", 100);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("Expected parsed result");
    expect(result.mimeType).toBe("image/webp");
  });

  it("returns 422 INVALID_AVATAR_URL for disallowed MIME type (application/pdf)", async () => {
    const file = createMockFile("application/pdf", 100);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 422 INVALID_HEADER_URL for disallowed MIME type (application/octet-stream)", async () => {
    const file = createMockFile("application/octet-stream", 100);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "header");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_HEADER_URL");
  });

  it("rejects image/gif (not allowed for profile images)", async () => {
    const file = createMockFile("image/gif", 100);
    const formData = new Map<string, unknown>([["file", file]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_AVATAR_URL");
  });
});

// ------------------------------------------------------------------ //
//  Tests — error handling on malformed requests                       //
// ------------------------------------------------------------------ //

describe("parseMultipartImage — error handling", () => {
  it("returns 422 INVALID_AVATAR_URL when content-type is not multipart/form-data", async () => {
    const request: Parameters<typeof parseMultipartImage>[0] = {
      headers: { get: () => "application/json" },
    };

    const result = await parseMultipartImage(request, "avatar");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 422 INVALID_HEADER_URL when no file field is provided", async () => {
    const formData = new Map<string, unknown>([["name", "John"]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "header");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_HEADER_URL");
  });

  it("returns 422 with INVALID_AVATAR_URL for empty file field", async () => {
    const formData = new Map<string, unknown>([["file", null]]);
    const request = createRequest(formData, "multipart/form-data; boundary=b");

    const result = await parseMultipartImage(request, "avatar");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 422 when content-type header is missing", async () => {
    const request: Parameters<typeof parseMultipartImage>[0] = {
      headers: { get: () => null },
    };

    const result = await parseMultipartImage(request, "avatar");

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected Response");
    expect(result.status).toBe(422);
    const body = await result.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_AVATAR_URL");
  });
});

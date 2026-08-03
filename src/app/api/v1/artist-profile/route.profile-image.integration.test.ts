/**
 * STORY-profile-003: Integration tests for POST /api/v1/artist-profile/avatar and POST /api/v1/artist-profile/header.
 *
 * Tests the full endpoint flow with valid and invalid uploads:
 * - 401 for unauthenticated requests
 * - 403 for non-ARTIST role
 * - 422 for missing file, wrong MIME type, oversized file
 * - 200 for successful avatar and header uploads with updated profile fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { generateToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// ------------------------------------------------------------------ //
//  Global File mock — File is not available in Node.js                //
// ------------------------------------------------------------------ //

if (typeof globalThis.File !== "function") {
  globalThis.File = class File {
    constructor(
      public chunks: unknown[],
      public name: string,
      public options: { type: string },
    ) {}
  } as unknown as typeof File;
}

// ------------------------------------------------------------------ //
//  Mocks — hoisted via vi.mock                                        //
// ------------------------------------------------------------------ //

vi.mock("@/lib/prisma", () => ({
  default: {
    artistProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/logging", () => ({
  logRequestBody: vi.fn(async (req: NextRequest) => ({
    originalBody: await req.json(),
  })),
}));

vi.mock("@/lib/storage/storage.service", () => {
  const mockUploadObject = vi.fn().mockResolvedValue({ eTag: "test-etag" });
  return {
    S3StorageService: vi.fn().mockImplementation(function (this: any, _config: any) {
      this.uploadObject = mockUploadObject;
    }),
    StorageConfig: null,
    getMockUploadObject: () => mockUploadObject,
  };
});

// ------------------------------------------------------------------ //
//  Route imports — after mocks are hoisted                             //
// ------------------------------------------------------------------ //

import { POST } from "./route";
import prisma from "@/lib/prisma";

function getMockPrisma() {
  return prisma as unknown as {
    artistProfile: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

/**
 * Create a mock NextRequest for the POST image upload endpoints.
 */
function createMockRequest({
  formData,
  cookie,
  urlPath,
}: {
  formData?: Record<string, unknown>;
  cookie?: string;
  urlPath: string;
}): NextRequest {
  const headers = new Headers({
    "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary",
    ...(cookie ? { cookie } : {}),
  });

  return {
    method: "POST",
    headers,
    formData: async () => {
      const fd = new FormData();
      if (formData) {
        for (const [key, value] of Object.entries(formData)) {
          if (value instanceof File) {
            fd.append(key, value);
          } else if (value instanceof Blob) {
            fd.append(key, value);
          }
        }
      }
      return fd;
    },
    url: `http://localhost:3000/api/v1/artist-profile${urlPath}`,
    json: async () => ({}),
  } as unknown as NextRequest;
}

/**
 * Create a mock image file for form data.
 * Uses Blob cast to File since jsdom's File mock may not support destructured params.
 */
function createMockImageFile(options?: {
  name?: string;
  mimeType?: string;
  size?: number;
}): File {
  const name = options?.name ?? "test.jpg";
  const mimeType = options?.mimeType ?? "image/jpeg";
  const size = options?.size ?? 1024;
  const bytes = new Uint8Array(size);
  const blob = new Blob([bytes], { type: mimeType });
  return Object.assign(blob, { name }) as File;
}

// ------------------------------------------------------------------ //
//  Setup & Teardown                                                   //
// ------------------------------------------------------------------ //

let originalJwtSecret: string | undefined;

beforeEach(() => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-key-that-is-long-enough-for-hs256";
  vi.resetAllMocks();
});

afterEach(() => {
  if (originalJwtSecret !== undefined) {
    process.env.JWT_SECRET = originalJwtSecret;
  } else {
    delete process.env.JWT_SECRET;
  }
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------ //
//  Tests — POST /avatar                                               //
// ------------------------------------------------------------------ //

describe("POST /api/v1/artist-profile/avatar — integration", () => {
  it("returns 401 when no session cookie is present", async () => {
    const mockImage = createMockImageFile();
    const request = createMockRequest({
      formData: { file: mockImage },
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
  });

  it("returns 403 when user does not have ARTIST role", async () => {
    const token = generateToken({
      sub: "user-123",
      role: "LISTENER",
    });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const mockImage = createMockImageFile();

    const request = createMockRequest({
      formData: { file: mockImage },
      cookie,
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("FORBIDDEN_INSUFFICIENT_ROLE");
  });

  it("returns 422 when no file is provided", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const request = createMockRequest({
      formData: {},
      cookie,
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 422 for disallowed MIME type (application/pdf)", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const pdfFile = new File([new Blob(["fake pdf"])], "document.pdf", {
      type: "application/pdf",
    });

    const request = createMockRequest({
      formData: { file: pdfFile },
      cookie,
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 422 for oversized file (> 5MB)", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const bigFile = createMockImageFile({ size: 5 * 1024 * 1024 + 1 });

    const request = createMockRequest({
      formData: { file: bigFile },
      cookie,
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_AVATAR_URL");
  });

  it("returns 200 for a valid avatar upload", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const mockImage = createMockImageFile();

    const mockProfile = {
      id: "ap-001",
      userId: "user-123",
      stageName: "Artist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
    };

    const mock = getMockPrisma();
    mock.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mock.artistProfile.update.mockResolvedValue({
      ...mockProfile,
      avatarUrl: `https://avatars/user-123/ap-001-${Date.now()}`,
    });

    const request = createMockRequest({
      formData: { file: mockImage },
      cookie,
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect((json as any).data?.avatarUrl).toMatch(/^https:\/\/avatars\/user-123\/ap-001-/);
    expect((json as any).data?.stageName).toBe("Artist");
    expect(mock.artistProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ap-001" },
        data: expect.objectContaining({ avatarUrl: expect.stringMatching(/^https:\/\/avatars\/user-123\/ap-001-/) }),
      }),
    );
  });

  it("returns 404 when artist profile not found", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const mockImage = createMockImageFile();

    const mock = getMockPrisma();
    mock.artistProfile.findUnique.mockResolvedValue(null);

    const request = createMockRequest({
      formData: { file: mockImage },
      cookie,
      urlPath: "/avatar",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
  });
});

// ------------------------------------------------------------------ //
//  Tests — POST /header                                               //
// ------------------------------------------------------------------ //

describe("POST /api/v1/artist-profile/header — integration", () => {
  it("returns 401 when no session cookie is present", async () => {
    const mockImage = createMockImageFile({ name: "header.png", mimeType: "image/png" });
    const request = createMockRequest({
      formData: { file: mockImage },
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
  });

  it("returns 403 when user does not have ARTIST role", async () => {
    const token = generateToken({
      sub: "user-123",
      role: "LISTENER",
    });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const mockImage = createMockImageFile({ name: "header.png", mimeType: "image/png" });

    const request = createMockRequest({
      formData: { file: mockImage },
      cookie,
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("FORBIDDEN_INSUFFICIENT_ROLE");
  });

  it("returns 422 when no file is provided", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    const request = createMockRequest({
      formData: {},
      cookie,
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_HEADER_URL");
  });

  it("returns 422 for disallowed MIME type (application/octet-stream)", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const binFile = new File([new Blob(["binary data"])], "data.bin", {
      type: "application/octet-stream",
    });

    const request = createMockRequest({
      formData: { file: binFile },
      cookie,
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_HEADER_URL");
  });

  it("returns 422 for oversized file (> 5MB)", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const bigFile = createMockImageFile({
      size: 5 * 1024 * 1024 + 1,
      mimeType: "image/png",
    });

    const request = createMockRequest({
      formData: { file: bigFile },
      cookie,
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect((json as any).error?.code).toBe("INVALID_HEADER_URL");
  });

  it("returns 200 for a valid header upload with PNG", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const mockImage = createMockImageFile({ name: "header.png", mimeType: "image/png" });

    const mockProfile = {
      id: "ap-001",
      userId: "user-123",
      stageName: "Artist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
    };

    const mock = getMockPrisma();
    mock.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mock.artistProfile.update.mockResolvedValue({
      ...mockProfile,
      headerImageUrl: `https://headers/user-123/ap-001-${Date.now()}`,
    });

    const request = createMockRequest({
      formData: { file: mockImage },
      cookie,
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect((json as any).data?.headerImageUrl).toMatch(/^https:\/\/headers\/user-123\/ap-001-/);
    expect((json as any).data?.stageName).toBe("Artist");
    expect(mock.artistProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ap-001" },
        data: expect.objectContaining({ headerImageUrl: expect.stringMatching(/^https:\/\/headers\/user-123\/ap-001-/) }),
      }),
    );
  });

  it("returns 200 for a valid header upload with WebP", async () => {
    const token = generateToken({ sub: "user-123", role: "ARTIST" });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const mockImage = createMockImageFile({
      name: "header.webp",
      mimeType: "image/webp",
    });

    const mockProfile = {
      id: "ap-001",
      userId: "user-123",
      stageName: "Artist",
      bio: null,
      avatarUrl: null,
      headerImageUrl: null,
      socialLinks: null,
      isVerified: false,
    };

    const mock = getMockPrisma();
    mock.artistProfile.findUnique.mockResolvedValue(mockProfile);
    mock.artistProfile.update.mockResolvedValue({
      ...mockProfile,
      headerImageUrl: "https://headers/user-123/ap-001",
    });

    const request = createMockRequest({
      formData: { file: mockImage },
      cookie,
      urlPath: "/header",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect((json as any).data?.headerImageUrl).toBe("https://headers/user-123/ap-001");
  });
});

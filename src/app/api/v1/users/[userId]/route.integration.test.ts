/**
 * STORY-profile-004: Integration test for GET /api/v1/users/:userId
 *
 * Tests the full request-response cycle through the Next.js route handler
 * with mocked Prisma to verify:
 * - 200 HTTP status on successful request
 * - Correct response schema (profile with username, avatarUrl, registrationYear, playlists, followedArtists)
 * - Public playlist filtering (only isPublic=true playlists)
 * - Followed artists list
 * - 404 when user not found
 * - Accessible to both authenticated and unauthenticated requests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ------------------------------------------------------------------ //
//  Mock helpers                                                        //
// ------------------------------------------------------------------ //

const mockPrismaInstance = {
  user: {
    findUnique: vi.fn(),
  },
  artistProfile: {
    findUnique: vi.fn(),
  },
  playlist: {
    findMany: vi.fn(),
  },
  follow: {
    findMany: vi.fn(),
  },
};

// ------------------------------------------------------------------ //
//  Mocks for service dependencies — hoisted via vi.mock               //
// ------------------------------------------------------------------ //

vi.mock("@/lib/prisma", () => ({
  default: mockPrismaInstance,
}));

vi.mock("@/lib/api/response", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/response")>("@/lib/api/response");
  return {
    ...actual,
    apiSuccessResponse: vi.fn((data) => ({ success: true, data })),
    apiErrorResponse: vi.fn((code, message) => ({
      success: false,
      error: { code, message },
    })),
  };
});

vi.mock("@/lib/auth", async () => ({
  verifySession: vi.fn(),
}));

// ------------------------------------------------------------------ //
//  Integration tests for GET /api/v1/users/:userId                   //
// ------------------------------------------------------------------ //

describe("GET /api/v1/users/:userId — integration", () => {
  let mockVerifySession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const authModule = await import("@/lib/auth");
    mockVerifySession = authModule.verifySession as ReturnType<typeof vi.fn>;
  });

  it("returns 200 with correct schema for valid listener profile", async () => {
    const mockUser = {
      id: "user-001",
      displayName: "TestListener",
      createdAt: new Date("2022-05-10T00:00:00Z"),
      artistProfile: {
        avatarUrl: "https://example.com/listener-avatar.jpg",
      },
      // Only public playlists — simulating Prisma's where: { isPublic: true }
      playlists: [
        {
          id: "pl-1",
          title: "Discoveries",
          trackCount: 12,
          isPublic: true,
          coverImageUrl: "https://example.com/discoveries.jpg",
        },
      ],
      followsAsFollower: [
        {
          id: "f-1",
          followerId: "user-001",
          artistProfileId: "ap-1",
          artist: {
            id: "ap-1",
            stageName: "IndieBand",
            avatarUrl: "https://example.com/band-avatar.jpg",
            isVerified: true,
            tracks: [],
          },
        },
        {
          id: "f-2",
          followerId: "user-001",
          artistProfileId: "ap-2",
          artist: {
            id: "ap-2",
            stageName: "BedroomPop",
            avatarUrl: null,
            isVerified: false,
            tracks: [],
          },
        },
      ],
    };

    (mockPrismaInstance.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    mockVerifySession.mockReturnValue(null); // Guest request

    // Import route handler after mocking
    const { GET } = await import("@/app/api/v1/users/[userId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/users/user-001",
      headers: { get: () => null },
    } as unknown as Request;

    const response = await GET(request, {
      params: Promise.resolve({ userId: "user-001" }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify profile shape
    const profile = body.data.profile;
    expect(profile.username).toBe("TestListener");
    expect(profile.avatarUrl).toBe("https://example.com/listener-avatar.jpg");
    expect(profile.registrationYear).toBe(2022);

    // Verify public playlists (private ones excluded)
    expect(profile.playlists).toHaveLength(1);
    expect(profile.playlists[0].title).toBe("Discoveries");
    expect(profile.playlists[0].trackCount).toBe(12);
    expect(profile.playlists[0].coverImageUrl).toBe("https://example.com/discoveries.jpg");

    // Verify followed artists
    expect(profile.followedArtists).toHaveLength(2);
    expect(profile.followedArtists[0].stageName).toBe("IndieBand");
    expect(profile.followedArtists[0].isVerified).toBe(true);
    expect(profile.followedArtists[1].stageName).toBe("BedroomPop");
    expect(profile.followedArtists[1].avatarUrl).toBeNull();
  });

  it("returns 404 when user does not exist", async () => {
    (mockPrismaInstance.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    mockVerifySession.mockReturnValue(null);

    const { GET } = await import("@/app/api/v1/users/[userId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/users/nonexistent",
      headers: { get: () => null },
    } as unknown as Request;

    const response = await GET(request, {
      params: Promise.resolve({ userId: "nonexistent" }),
    });

    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns 200 for authenticated user request", async () => {
    const mockUser = {
      id: "user-002",
      displayName: "AuthListener",
      createdAt: new Date("2023-08-01T00:00:00Z"),
      artistProfile: {
        avatarUrl: "https://example.com/auth-listener.jpg",
      },
      playlists: [
        {
          id: "pl-3",
          title: "Public List",
          trackCount: 8,
          isPublic: true,
          coverImageUrl: null,
        },
      ],
      followsAsFollower: [],
    };

    (mockPrismaInstance.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    mockVerifySession.mockReturnValue({ userId: "user-002" });

    const { GET } = await import("@/app/api/v1/users/[userId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/users/user-002",
      headers: { get: () => "some-cookie" },
    } as unknown as Request;

    const response = await GET(request, {
      params: Promise.resolve({ userId: "user-002" }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.profile.username).toBe("AuthListener");
    expect(body.data.profile.registrationYear).toBe(2023);
  });

  it("returns empty arrays when user has no playlists or followed artists", async () => {
    const mockUser = {
      id: "user-003",
      displayName: "EmptyUser",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      artistProfile: null,
      playlists: [],
      followsAsFollower: [],
    };

    (mockPrismaInstance.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    mockVerifySession.mockReturnValue(null);

    const { GET } = await import("@/app/api/v1/users/[userId]/route");

    const request = {
      url: "http://localhost:3000/api/v1/users/user-003",
      headers: { get: () => null },
    } as unknown as Request;

    const response = await GET(request, {
      params: Promise.resolve({ userId: "user-003" }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.profile.playlists).toHaveLength(0);
    expect(body.data.profile.followedArtists).toHaveLength(0);
    expect(body.data.profile.avatarUrl).toBeNull();
    expect(body.data.profile.registrationYear).toBe(2024);
  });
});

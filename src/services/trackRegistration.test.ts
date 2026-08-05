/**
 * STORY-track-003: Unit tests for Track Registration Service
 *
 * Covers:
 * - validateTrackInput for title, genre, audioStorageKey
 * - normalizeGenre taxonomic normalization
 * - resolveCoverImage explicit and default cover URLs
 * - createTrack — mocking Prisma and the storage/audio-metadata service
 *   to verify auto-live assignment, default cover art fallback, duration extraction,
 *   and correct persisted payload shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  hoist mocks — module paths must resolve BEFORE any real import     */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/prisma", () => ({
  default: {
    track: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/services/audioMetadata", () => ({
  extractAudioMetadata: vi.fn(),
  CorruptedAudioError: class CorruptedAudioError extends Error {
    override name = "CorruptedAudioError";
  },
}));

vi.mock("@/lib/storage/storage-provider", () => ({
  createStorageProvider: vi.fn(() => ({
    deleteObject: vi.fn().mockResolvedValue(undefined),
  })),
}));

/* ------------------------------------------------------------------ */
/*  imports — after mocks are hoisted                                   */
/* ------------------------------------------------------------------ */

import prisma from "@/lib/prisma";
import { extractAudioMetadata, CorruptedAudioError } from "@/services/audioMetadata";

import {
  validateTrackInput,
  normalizeGenre,
  resolveCoverImage,
  createTrack,
  type CreateTrackInput,
} from "./trackRegistration";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_ARTIST_PROFILE_ID = "ap-test-001";

// Minimal valid input for createTrack (unit-level — calls mocked prisma.track.create)
function buildValidInput(overrides?: Partial<CreateTrackInput>): CreateTrackInput {
  return {
    title: "Midnight Echoes",
    genre: "INDIE_ROCK",
    artistProfileId: DEFAULT_ARTIST_PROFILE_ID,
    audioStorageKey: "audio/ap-001/track-1/abc123.mp3",
    ...overrides,
  };
}

function getMockTrack(): {
  id: string;
  title: string;
  genre: string;
  description: string | null;
  audioStorageKey: string;
  audioUrl: string | null;
  coverImageUrl: string;
  coverImageStorageKey: string | null;
  artistProfileId: string;
  status: string;
  duration: number;
  playCount: number;
  likeCount: number;
  isLive: boolean;
  isSoftHidden: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} {
  const now = new Date();
  return {
    id: "t-created-001",
    title: "Midnight Echoes",
    genre: "INDIE_ROCK",
    description: "A haunting track",
    audioStorageKey: "audio/ap-001/track-1/abc123.mp3",
    audioUrl: null,
    coverImageUrl: "/static/covers/defaults/indie_rock.png",
    coverImageStorageKey: null,
    artistProfileId: DEFAULT_ARTIST_PROFILE_ID,
    status: "LIVE",
    duration: 245.67,
    playCount: 0,
    likeCount: 0,
    isLive: true,
    isSoftHidden: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/*  validateTrackInput tests                                          */
/* ------------------------------------------------------------------ */

describe("validateTrackInput", () => {
  it("returns null for valid input", () => {
    const input = buildValidInput();
    const result = validateTrackInput(input);
    expect(result).toBeNull();
  });

  it("rejects missing title (undefined)", () => {
    const input = buildValidInput({ title: undefined as unknown as string });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "title", code: "TITLE_REQUIRED" }),
    );
  });

  it("rejects empty string title", () => {
    const input = buildValidInput({ title: "" });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "title", code: "TITLE_REQUIRED" }),
    );
  });

  it("rejects whitespace-only title", () => {
    const input = buildValidInput({ title: "   " });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "title", code: "TITLE_REQUIRED" }),
    );
  });

  it("rejects title too long (> 100 chars)", () => {
    const input = buildValidInput({ title: "a".repeat(101) });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "title", code: "TITLE_TOO_LONG" }),
    );
  });

  it("rejects invalid genre", () => {
    const input = buildValidInput({ genre: "METAL" as unknown as string });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "genre", code: "INVALID_GENRE" }),
    );
  });

  it("rejects missing audioStorageKey", () => {
    const input = buildValidInput({ audioStorageKey: undefined as unknown as string });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "audioStorageKey", code: "AUDIO_STORAGE_KEY_REQUIRED" }),
    );
  });

  it("rejects empty audioStorageKey", () => {
    const input = buildValidInput({ audioStorageKey: "" });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toContainEqual(
      expect.objectContaining({ field: "audioStorageKey", code: "AUDIO_STORAGE_KEY_REQUIRED" }),
    );
  });

  it("returns multiple errors when combined issues exist", () => {
    const input = buildValidInput({
      title: "",
      genre: "METAL" as unknown as string,
      audioStorageKey: "",
    });
    const result = validateTrackInput(input);
    expect(result).not.toBeNull();
    expect(result!.details).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  normalizeGenre tests                                              */
/* ------------------------------------------------------------------ */

describe("normalizeGenre", () => {
  it("normalizes lowercase genre to uppercase", () => {
    expect(normalizeGenre("indie_rock")).toBe("INDIE_ROCK");
  });

  it("passes through uppercase genre", () => {
    expect(normalizeGenre("ELECTRONIC")).toBe("ELECTRONIC");
  });

  it("trims whitespace", () => {
    expect(normalizeGenre("  hip_hop  ")).toBe("HIP_HOP");
  });

  it("throws on invalid genre", () => {
    expect(() => normalizeGenre("METAL")).toThrow("Invalid genre: METAL");
  });
});

/* ------------------------------------------------------------------ */
/*  resolveCoverImage tests                                            */
/* ------------------------------------------------------------------ */

describe("resolveCoverImage", () => {
  it("returns explicit coverImageStorageKey when provided", () => {
    const key = "covers/artist1/cover-img.webp";
    expect(resolveCoverImage(key, "INDIE_ROCK")).toBe(key);
  });

  it("returns default genre cover when storage key is omitted", () => {
    const url = resolveCoverImage(undefined, "AMBIENT");
    expect(url).toBe("/static/covers/defaults/ambient.png");
  });

  it("uses the lowercased genre name in default cover URL", () => {
    const url = resolveCoverImage(undefined, "BEDROOM_POP");
    expect(url).toBe("/static/covers/defaults/bedroom_pop.png");
  });

  it("uses lowercased genre even for UPPER_GENRE input in default", () => {
    const url = resolveCoverImage(undefined, "HIP_HOP");
    expect(url).toBe("/static/covers/defaults/hip_hop.png");
  });
});

/* ------------------------------------------------------------------ */
/*  createTrack integration-style unit tests                           */
/* ------------------------------------------------------------------ */

describe("createTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // Clean .env for isolated test
    delete process.env.S3_BUCKET_NAME;
    delete process.env.AWS_REGION;
    delete process.env.S3_ENDPOINT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws validation error when input is missing title", async () => {
    const input = buildValidInput({ title: undefined as unknown as string });
    await expect(createTrack(input)).rejects.toThrow("Track registration validation failed");
    const err = await createTrack(input).catch((e) => e);
    expect((err as any).validationErrors).not.toBeNull();
  });

  it("throws validation error when genre is invalid", async () => {
    const input = buildValidInput({ genre: "JAZZ" as unknown as string });
    await expect(createTrack(input)).rejects.toThrow("Track registration validation failed");
  });

  it("throws validation error when audioStorageKey is missing", async () => {
    const input = buildValidInput({ audioStorageKey: "" });
    await expect(createTrack(input)).rejects.toThrow("Track registration validation failed");
  });

  it("sets Track.status to LIVE automatically per DEC-001", async () => {
    const mockTrack = getMockTrack();
    mockTrack.status = "LIVE";

    (prisma.track.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrack);

    // Mock successful audio metadata extraction
    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      duration: 245.67,
      durationMs: 245670,
      bitrate: 128000,
      sampleRate: 44100,
      channels: 2,
      codec: "mp3",
    });

    const result = await createTrack(buildValidInput());

    expect((prisma.track.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.status).toBe("LIVE");
    expect(result.status).toBe("LIVE");
  });

  it("extracts audio duration and stores it on the Track", async () => {
    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockReset();
    const expectedDuration = 180.42;
    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      duration: expectedDuration,
      durationMs: 180420,
      bitrate: 320000,
      sampleRate: 48000,
      channels: 2,
      codec: "mp3",
    });

    const mockTrack = getMockTrack();
    mockTrack.duration = 180.42;
    mockTrack.coverImageUrl = "/static/covers/defaults/indie_rock.png";
    mockTrack.coverImageStorageKey = null;
    (prisma.track.create as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(mockTrack);

    const result = await createTrack(buildValidInput());

    expect(result.duration).toBe(expectedDuration);
    expect((prisma.track.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.duration).toBe(expectedDuration);
  });

  it("uses provided coverImageStorageKey for the cover", async () => {
    const coverKey = "covers/artist1/special.webp";
    const mockTrack = getMockTrack();
    mockTrack.coverImageUrl = coverKey;
    mockTrack.coverImageStorageKey = coverKey;
    (prisma.track.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrack);

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      duration: 0,
      durationMs: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      codec: "mp3",
    });

    const result = await createTrack(
      buildValidInput({ coverImageStorageKey: coverKey }),
    );

    expect(result.coverImageUrl).toBe(coverKey);
  });

  it("assigns default genre cover URL when coverImageStorageKey is omitted", async () => {
    const mockTrack = getMockTrack();
    const expectedCover = "/static/covers/defaults/indie_rock.png";
    mockTrack.coverImageUrl = expectedCover;
    mockTrack.coverImageStorageKey = null;
    (prisma.track.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrack);

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      duration: 0,
      durationMs: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      codec: "mp3",
    });

    const result = await createTrack(buildValidInput());

    expect(result.coverImageUrl).toBe(expectedCover);
  });

  it("returns HTTP 201 payload shape with UTC ISO-8601 timestamps", async () => {
    const now = new Date();
    const mockTrack = getMockTrack();
    mockTrack.createdAt = now;
    mockTrack.updatedAt = now;
    (prisma.track.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrack);

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      duration: 0,
      durationMs: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      codec: "mp3",
    });

    const result = await createTrack(buildValidInput());

    // Verify required fields on response
    expect(result.id).toBeDefined();
    expect(typeof result.title).toBe("string");
    expect(typeof result.genre).toBe("string");
    expect(typeof result.createdAt).toBe("string");
    expect(typeof result.updatedAt).toBe("string");
    expect(result.coverImageUrl).toBeDefined();
    expect(result.playCount).toBe(0);
    expect(result.likeCount).toBe(0);
    expect(result.isLive).toBe(true);

    // Verify UTC ISO-8601 timestamp format
    expect(new Date(result.createdAt).getUTCDate()).toBe(now.getUTCDate());
    expect(new Date(result.updatedAt).getUTCDate()).toBe(now.getUTCDate());
  });

  it("throws error when audio file is corrupted (CorruptedAudioError)", async () => {
    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new CorruptedAudioError("Unrecognized audio container format", "bad.mp3"),
    );

    await expect(createTrack(buildValidInput({ audioStorageKey: "bad.mp3" }))).rejects.toThrow("corrupted or unreadable");
  });

  it("defaults duration to 0 when non-corrupted storage error occurs", async () => {
    const mockTrack = getMockTrack();
    mockTrack.duration = 0;
    mockTrack.coverImageUrl = "/static/covers/defaults/indie_rock.png";
    mockTrack.coverImageStorageKey = null;
    (prisma.track.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrack);

    (extractAudioMetadata as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    const result = await createTrack(buildValidInput());

    expect(result.duration).toBe(0);
    expect(result.status).toBe("LIVE");
  });
});

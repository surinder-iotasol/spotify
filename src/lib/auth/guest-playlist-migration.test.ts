/**
 * STORY-auth-005: Integration tests for guest playlist migration.
 *
 * Covers:
 *  - createPlaylistFromGuest — creates a Playlist + PlaylistTrack records
 *  - playlistMigrationSchema — validates input and rejects bad payloads
 *  - Error handling for duplicate tracks and empty tracks
 */

import { describe, it, expect } from "vitest";
import {
  playlistMigrationSchema,
  createPlaylistFromGuest,
  GUEST_PLAYLIST_MIGRATION_ERRORS,
  type CreatePlaylistFromGuestInput,
} from "@/lib/auth/guest-playlist-migration";
import { type ZodError } from "zod";

/* ------------------------------------------------------------------ */
/*  Mock Prisma Client                                                 */
/* ------------------------------------------------------------------ */

interface MockPlaylist {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  trackCount: number;
  totalDurationSeconds: number;
}

interface MockPlaylistTrack {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
}

function createMockPrisma() {
  const playlists: MockPlaylist[] = [];
  const playlistTracks: MockPlaylistTrack[] = [];

  return {
    playlist: {
      create: async ({
        data,
      }: {
        data: Omit<MockPlaylist, "createdAt" | "updatedAt">;
      }): Promise<MockPlaylist> => {
        const playlist: MockPlaylist = {
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        playlists.push(playlist);
        return playlist;
      },
    },
    playlistTrack: {
      create: async ({
        data,
      }: {
        data: Omit<MockPlaylistTrack, "id">;
      }): Promise<MockPlaylistTrack> => {
        const track: MockPlaylistTrack = {
          ...data,
          id: crypto.randomUUID(),
        };
        playlistTracks.push(track);
        return track;
      },
    },
    // Expose collections for assertions
    _playlists: playlists,
    _playlistTracks: playlistTracks,
  };
}

/* ------------------------------------------------------------------ */
/*  createPlaylistFromGuest                                            */
/* ------------------------------------------------------------------ */

describe("createPlaylistFromGuest", () => {
  it("creates a Playlist and PlaylistTrack records in the database", async () => {
    const mock = createMockPrisma();

    const input: CreatePlaylistFromGuestInput = {
      userId: "user-1",
      title: "My Draft Playlist",
      description: "Imported from guest session",
      isPublic: false,
      tracks: [
        { trackId: "track-1", position: 0 },
        { trackId: "track-2", position: 1 },
      ],
    };

    const playlist = await createPlaylistFromGuest(mock as unknown as any, input);

    // Playlist was created
    expect(playlist.title).toBe("My Draft Playlist");
    expect(playlist.userId).toBe("user-1");
    expect(playlist.isPublic).toBe(false);
    expect(playlist.description).toBe("Imported from guest session");
    expect(playlist.trackCount).toBe(2);
    expect(playlist.totalDurationSeconds).toBe(0.0);

    // PlaylistTrack junctions were created
    const tracks = mock._playlistTracks;
    expect(tracks).toHaveLength(2);
    expect(tracks[0].trackId).toBe("track-1");
    expect(tracks[0].position).toBe(0);
    expect(tracks[0].playlistId).toBe(playlist.id);
    expect(tracks[1].trackId).toBe("track-2");
    expect(tracks[1].position).toBe(1);
    expect(tracks[1].playlistId).toBe(playlist.id);
  });

  it("creates a playlist with a single track", async () => {
    const mock = createMockPrisma();

    const input: CreatePlaylistFromGuestInput = {
      userId: "user-2",
      title: "Solo Track",
      isPublic: true,
      tracks: [{ trackId: "track-99", position: 0 }],
    };

    const playlist = await createPlaylistFromGuest(mock as unknown as any, input);

    expect(playlist.trackCount).toBe(1);
    expect(mock._playlistTracks).toHaveLength(1);
  });

  it("creates a playlist without optional description", async () => {
    const mock = createMockPrisma();

    const input: CreatePlaylistFromGuestInput = {
      userId: "user-3",
      title: "No Description",
      isPublic: true,
      tracks: [{ trackId: "t1", position: 0 }],
    };

    const playlist = await createPlaylistFromGuest(mock as unknown as any, input);

    expect(playlist.description).toBeUndefined();
  });

  it("uses random UUIDs for playlist and track IDs", async () => {
    const mock = createMockPrisma();

    const input: CreatePlaylistFromGuestInput = {
      userId: "user-4",
      title: "UUID Test",
      isPublic: false,
      tracks: [{ trackId: "t1", position: 0 }],
    };

    const playlist = await createPlaylistFromGuest(mock as unknown as any, input);
    expect(playlist.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mock._playlistTracks[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mock._playlistTracks[0].id).not.toBe(playlist.id);
  });
});

/* ------------------------------------------------------------------ */
/*  playlistMigrationSchema                                            */
/* ------------------------------------------------------------------ */

describe("playlistMigrationSchema", () => {
  it("accepts a valid payload", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Valid Playlist",
      isPublic: true,
      tracks: [{ trackId: "t1", position: 0 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Valid Playlist");
    }
  });

  it("accepts a payload without optional fields", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Minimal",
      tracks: [{ trackId: "t1", position: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with missing title", () => {
    const result = playlistMigrationSchema.safeParse({
      tracks: [{ trackId: "t1", position: 0 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error as ZodError;
      expect(error.issues[0].path).toContain("title");
    }
  });

  it("rejects a payload with empty title", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "",
      tracks: [{ trackId: "t1", position: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a payload with no tracks", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Empty",
      tracks: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error as ZodError;
      expect(error.issues[0].path).toContain("tracks");
    }
  });

  it("rejects a payload with missing trackId", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Bad Track",
      tracks: [{ position: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a payload with negative position", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Neg Pos",
      tracks: [{ trackId: "t1", position: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a payload with non-integer position", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Float Pos",
      tracks: [{ trackId: "t1", position: 0.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple tracks with correct positions", () => {
    const result = playlistMigrationSchema.safeParse({
      title: "Multi",
      isPublic: true,
      description: "A multi-track playlist",
      tracks: [
        { trackId: "t1", position: 0 },
        { trackId: "t2", position: 1 },
        { trackId: "t3", position: 2 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tracks).toHaveLength(3);
    }
  });

  it("rejects payloads with too many tracks", () => {
    const tracks = Array.from({ length: 501 }, (_, i) => ({
      trackId: `t${i}`,
      position: i,
    }));
    const result = playlistMigrationSchema.safeParse({
      title: "Too Long",
      tracks,
    });
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

describe("GUEST_PLAYLIST_MIGRATION_ERRORS", () => {
  it("defines expected error codes", () => {
    expect(GUEST_PLAYLIST_MIGRATION_ERRORS.INVALID_BODY).toBe("INVALID_BODY");
    expect(GUEST_PLAYLIST_MIGRATION_ERRORS.INVALID_TITLE).toBe("INVALID_TITLE");
    expect(GUEST_PLAYLIST_MIGRATION_ERRORS.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
    expect(GUEST_PLAYLIST_MIGRATION_ERRORS.UNAUTHENTICATED).toBe("UNAUTHENTICATED");
    expect(GUEST_PLAYLIST_MIGRATION_ERRORS.DUPLICATE_TRACK).toBe("DUPLICATE_TRACK");
    expect(GUEST_PLAYLIST_MIGRATION_ERRORS.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});

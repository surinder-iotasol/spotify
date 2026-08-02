/**
 * STORY-auth-005: Unit tests for guest session migration helpers.
 *
 * Covers:
 *  - extractGuestPlaylists — reads draft playlists from a simulated storage
 *  - extractGuestPlaybackState — reads playback state from storage
 *  - extractGuestSession — combined extraction
 *  - formatGuestPlaylistPayload — payload formatting for API submission
 *  - formatGuestPlaylistBatch — batch formatting
 *  - sanitisePlaylistTitle / sanitisePlaylistDescription — sanitisation helpers
 */

import { describe, it, expect } from "vitest";
import {
  GUEST_PLAYLISTS_KEY,
  GUEST_PLAYBACK_KEY,
  extractGuestPlaylists,
  extractGuestPlaybackState,
  extractGuestSession,
  formatGuestPlaylistPayload,
  formatGuestPlaylistBatch,
  sanitisePlaylistTitle,
  sanitisePlaylistDescription,
  type GuestPlaylist,
  type GuestPlaybackState,
} from "./guest-session";

/* ------------------------------------------------------------------ */
/*  Mock storage helpers                                                */
/* ------------------------------------------------------------------ */

function createMockStorage(
  initial: Record<string, string> = {},
): Storage {
  const store = Object.fromEntries(
    Object.entries(initial),
  ) as Record<string, string>;
  return {
    getItem: (key: string) => key in store ? store[key] ?? null : null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (n: number) => {
      const keys = Object.keys(store);
      return keys[n] ?? null;
    },
  } as Storage;
}

/* ------------------------------------------------------------------ */
/*  extractGuestPlaylists                                               */
/* ------------------------------------------------------------------ */

describe("extractGuestPlaylists", () => {
  it("returns empty array when storage is null (SSR)", () => {
    const playlists = extractGuestPlaylists(null);
    expect(playlists).toEqual([]);
  });

  it("returns empty array when key is not present", () => {
    const storage = createMockStorage();
    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toEqual([]);
  });

  it("returns empty array when value is not a JSON array", () => {
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: '"not an array"',
    });
    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toEqual([]);
  });

  it("returns empty array when JSON is malformed", () => {
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: '{"invalid json',
    });
    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toEqual([]);
  });

  it("returns empty array when playlist has no tracks", () => {
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify([
        { title: "Empty", tracks: [] },
      ]),
    });
    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toEqual([]);
  });

  it("returns empty array when playlist has no title", () => {
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify([
        { tracks: [{ trackId: "t1", position: 0 }] },
      ]),
    });
    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toEqual([]);
  });

  it("returns empty array when playlist has non-object tracks", () => {
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify([
        { title: "Bad", tracks: ["not-an-object"] },
      ]),
    });
    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toEqual([]);
  });

  it("extracts a valid single playlist", () => {
    const draft: GuestPlaylist = {
      title: "My Draft",
      description: "A draft playlist",
      isPublic: false,
      tracks: [
        { trackId: "track-1", position: 0 },
        { trackId: "track-2", position: 1 },
      ],
      lastModified: "2025-01-01T00:00:00.000Z",
    };
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify([draft]),
    });

    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toHaveLength(1);
    expect(playlists[0].title).toBe("My Draft");
    expect(playlists[0].description).toBe("A draft playlist");
    expect(playlists[0].isPublic).toBe(false);
    expect(playlists[0].tracks).toHaveLength(2);
  });

  it("extracts multiple valid playlists", () => {
    const drafts: GuestPlaylist[] = [
      {
        title: "Draft 1",
        isPublic: true,
        tracks: [{ trackId: "t1", position: 0 }],
      },
      {
        title: "Draft 2",
        isPublic: false,
        tracks: [{ trackId: "t2", position: 0 }],
      },
    ];
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify(drafts),
    });

    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toHaveLength(2);
    expect(playlists[0].title).toBe("Draft 1");
    expect(playlists[1].title).toBe("Draft 2");
  });

  it("filters out invalid items from a mixed array", () => {
    const items: unknown[] = [
      { title: "Valid", tracks: [{ trackId: "t1", position: 0 }] },
      null,
      "string",
      42,
      { title: "Another Valid", tracks: [{ trackId: "t2", position: 0 }] },
    ];
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify(items),
    });

    const playlists = extractGuestPlaylists(storage);
    expect(playlists).toHaveLength(2);
    expect(playlists[0].title).toBe("Valid");
    expect(playlists[1].title).toBe("Another Valid");
  });
});

/* ------------------------------------------------------------------ */
/*  extractGuestPlaybackState                                           */
/* ------------------------------------------------------------------ */

describe("extractGuestPlaybackState", () => {
  it("returns null when storage is null", () => {
    const state = extractGuestPlaybackState(null);
    expect(state).toBeNull();
  });

  it("returns null when key is not present", () => {
    const storage = createMockStorage();
    const state = extractGuestPlaybackState(storage);
    expect(state).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: "{broken",
    });
    const state = extractGuestPlaybackState(storage);
    expect(state).toBeNull();
  });

  it("returns null when trackId is missing", () => {
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: JSON.stringify({ position: 10 }),
    });
    const state = extractGuestPlaybackState(storage);
    expect(state).toBeNull();
  });

  it("returns null when trackId is empty string", () => {
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: JSON.stringify({ trackId: "", position: 10 }),
    });
    const state = extractGuestPlaybackState(storage);
    expect(state).toBeNull();
  });

  it("returns null when position is negative", () => {
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: JSON.stringify({ trackId: "t1", position: -1 }),
    });
    const state = extractGuestPlaybackState(storage);
    expect(state).toBeNull();
  });

  it("extracts a valid playback state", () => {
    const stateData: GuestPlaybackState = {
      trackId: "track-100",
      position: 45.5,
      playlistId: "playlist-42",
      lastModified: "2025-01-01T12:00:00.000Z",
    };
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: JSON.stringify(stateData),
    });

    const state = extractGuestPlaybackState(storage);
    expect(state).not.toBeNull();
    expect(state!.trackId).toBe("track-100");
    expect(state!.position).toBe(45.5);
    expect(state!.playlistId).toBe("playlist-42");
  });

  it("omits playlistId when not a string", () => {
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: JSON.stringify({
        trackId: "t1",
        position: 0,
        playlistId: 123,
      }),
    });

    const state = extractGuestPlaybackState(storage);
    expect(state).not.toBeNull();
    expect(state!.playlistId).toBeUndefined();
  });

  it("preserves position of 0", () => {
    const storage = createMockStorage({
      [GUEST_PLAYBACK_KEY]: JSON.stringify({ trackId: "t1", position: 0 }),
    });

    const state = extractGuestPlaybackState(storage);
    expect(state).not.toBeNull();
    expect(state!.position).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  extractGuestSession                                                 */
/* ------------------------------------------------------------------ */

describe("extractGuestSession", () => {
  it("returns empty playlists and null playback when storage is empty", () => {
    const storage = createMockStorage();
    const data = extractGuestSession(storage);
    expect(data.playlists).toEqual([]);
    expect(data.playbackState).toBeNull();
  });

  it("returns both playlists and playback state when present", () => {
    const playlists: GuestPlaylist[] = [
      { title: "Draft 1", isPublic: false, tracks: [{ trackId: "t1", position: 0 }] },
    ];
    const playback: GuestPlaybackState = {
      trackId: "t1",
      position: 30,
    };
    const storage = createMockStorage({
      [GUEST_PLAYLISTS_KEY]: JSON.stringify(playlists),
      [GUEST_PLAYBACK_KEY]: JSON.stringify(playback),
    });

    const data = extractGuestSession(storage);
    expect(data.playlists).toHaveLength(1);
    expect(data.playbackState).not.toBeNull();
    expect(data.playbackState!.trackId).toBe("t1");
  });
});

/* ------------------------------------------------------------------ */
/*  formatGuestPlaylistPayload                                          */
/* ------------------------------------------------------------------ */

describe("formatGuestPlaylistPayload", () => {
  it("formats a draft playlist into API payload shape", () => {
    const draft: GuestPlaylist = {
      title: "My Playlist",
      description: "A great playlist",
      isPublic: true,
      tracks: [
        { trackId: "t1", position: 0 },
        { trackId: "t2", position: 1 },
      ],
    };

    const payload = formatGuestPlaylistPayload(draft);

    expect(payload.title).toBe("My Playlist");
    expect(payload.description).toBe("A great playlist");
    expect(payload.isPublic).toBe(true);
    expect(payload.tracks).toHaveLength(2);
    expect(payload.userId).toBe(""); // caller sets post-auth
  });

  it("handles undefined description gracefully", () => {
    const draft: GuestPlaylist = {
      title: "Simple",
      isPublic: false,
      tracks: [{ trackId: "t1", position: 0 }],
    };

    const payload = formatGuestPlaylistPayload(draft);
    expect(payload.description).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  formatGuestPlaylistBatch                                            */
/* ------------------------------------------------------------------ */

describe("formatGuestPlaylistBatch", () => {
  it("formats multiple drafts into batch payloads", () => {
    const drafts: GuestPlaylist[] = [
      {
        title: "Rock Mix",
        isPublic: true,
        tracks: [{ trackId: "t1", position: 0 }],
      },
      {
        title: "Chill Vibes",
        isPublic: false,
        tracks: [
          { trackId: "t2", position: 0 },
          { trackId: "t3", position: 1 },
        ],
      },
    ];

    const payloads = formatGuestPlaylistBatch(drafts);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].title).toBe("Rock Mix");
    expect(payloads[1].title).toBe("Chill Vibes");
  });

  it("returns empty array for empty input", () => {
    const payloads = formatGuestPlaylistBatch([]);
    expect(payloads).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Sanitisation helpers                                                */
/* ------------------------------------------------------------------ */

describe("sanitisePlaylistTitle", () => {
  it("trims whitespace", () => {
    expect(sanitisePlaylistTitle("  Hello  ")).toBe("Hello");
  });

  it("truncates to 200 characters", () => {
    const longTitle = "a".repeat(300);
    const result = sanitisePlaylistTitle(longTitle);
    expect(result).toHaveLength(200);
  });

  it("returns empty string for non-string input", () => {
    expect(sanitisePlaylistTitle(123 as unknown as string)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(sanitisePlaylistTitle("")).toBe("");
  });
});

describe("sanitisePlaylistDescription", () => {
  it("trims whitespace", () => {
    expect(sanitisePlaylistDescription("  Desc  ")).toBe("Desc");
  });

  it("returns undefined for empty string after trim", () => {
    expect(sanitisePlaylistDescription("   ")).toBeUndefined();
  });

  it("truncates to 2000 characters", () => {
    const longDesc = "b".repeat(3000);
    const result = sanitisePlaylistDescription(longDesc);
    expect(result).toHaveLength(2000);
  });

  it("returns undefined for undefined input", () => {
    expect(sanitisePlaylistDescription(undefined)).toBeUndefined();
  });

  it("returns undefined for non-string input", () => {
    expect(sanitisePlaylistDescription(42 as unknown as string)).toBeUndefined();
  });
});

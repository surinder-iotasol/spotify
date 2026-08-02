/**
 * STORY-auth-005: Guest Session Migration Service
 *
 * Provides client-side helpers to extract draft playlist state and active
 * playback state from localStorage so that guest (unauthenticated) users
 * can seamlessly migrate their playlists into permanent, user-owned Playlist
 * records after registration or sign-in.
 *
 * Storage keys (const to allow override in tests):
 *   - GUEST_PLAYLISTS_KEY  → "guest_playlists"  — array of draft playlists
 *   - GUEST_PLAYBACK_KEY  → "guest_playback"   — current player state
 *
 * Each draft playlist is stored as a JSON-serialisable object with:
 *   - title          (string)
 *   - description    (string | undefined)
 *   - isPublic       (boolean, default false)
 *   - tracks         ({ trackId, position }[])
 *
 * The playback state object tracks which track is playing and the position
 * so the audio player can resume without resetting (DEC-005).
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** localStorage key for guest draft playlists. */
export const GUEST_PLAYLISTS_KEY = "guest_playlists";

/** localStorage key for guest playback state. */
export const GUEST_PLAYBACK_KEY = "guest_playback";

/** Maximum number of draft playlists a guest can have. */
export const MAX_GUEST_PLAYLISTS = 20;

/** Maximum number of tracks in a single draft playlist. */
export const MAX_GUEST_TRACKS = 500;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A single track entry in a guest draft playlist. */
export interface GuestPlaylistTrack {
  /** Track ID from the platform or an external source. */
  trackId: string;
  /** Position within the playlist (0-based). */
  position: number;
}

/** A draft playlist stored in guest localStorage. */
export interface GuestPlaylist {
  /** Human-readable title for the draft playlist. */
  title: string;
  /** Optional description. */
  description?: string;
  /** Whether the playlist should be public when created. */
  isPublic: boolean;
  /** Ordered list of tracks in the draft. */
  tracks: GuestPlaylistTrack[];
  /** ISO timestamp when the draft was last modified (for TTL logic). */
  lastModified?: string;
}

/** Current playback state stored by the guest audio player. */
export interface GuestPlaybackState {
  /** Track ID currently being played (or queued). */
  trackId: string;
  /** Playback position in seconds. */
  position: number;
  /** Playlist context — the playlist ID the track belongs to. */
  playlistId?: string;
  /** ISO timestamp of last state change. */
  lastModified?: string;
}

/** Parsed result of guest state extraction. */
export interface GuestSessionData {
  /** Extracted draft playlists (may be empty). */
  playlists: GuestPlaylist[];
  /** Current playback state, or null if none recorded. */
  playbackState: GuestPlaybackState | null;
}

/** Input for creating a permanent playlist from guest data. */
export interface CreatePlaylistFromGuest {
  /** The owner user ID (post-auth). */
  userId: string;
  /** Draft playlist title. */
  title: string;
  /** Optional description. */
  description?: string;
  /** Whether the playlist should be public. */
  isPublic: boolean;
  /** Ordered tracks to add. */
  tracks: GuestPlaylistTrack[];
}

/** Result of the migration helper. */
export interface MigrationResult {
  /** Whether any playlists were extracted. */
  hasPlaylists: boolean;
  /** Extracted playlists ready for migration. */
  playlists: GuestPlaylist[];
  /** Whether playback state was present. */
  hasPlayback: boolean;
  /** Extracted playback state. */
  playbackState: GuestPlaybackState | null;
}

/* ------------------------------------------------------------------ */
/*  Extraction helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Extract guest draft playlists from localStorage.
 *
 * This is the key public function that answers acceptance criterion #1:
 * "Guest session state reader extracts local draft playlist tracks from
 * client storage post-registration."
 *
 * @param storage — Optional storage provider (defaults to window.localStorage).
 *                  Used to enable server-side rendering and testing.
 * @returns An array of parsed GuestPlaylist objects.
 *
 * @remarks
 * - Returns an empty array if localStorage is unavailable (SSR, private mode).
 * - Returns an empty array if the stored value is not a valid JSON array.
 * - Only returns playlists that are non-empty (have at least 1 track).
 */
export function extractGuestPlaylists(
  storage: Storage | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): GuestPlaylist[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(GUEST_PLAYLISTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item: unknown): item is GuestPlaylist => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const playlist = item as Partial<GuestPlaylist>;
      // Must have a title and at least one track
      if (!playlist.title || !Array.isArray(playlist.tracks)) {
        return false;
      }
      // Must have at least one valid track entry
      if (playlist.tracks.length === 0) {
        return false;
      }
      // Each track must have trackId and position
      return playlist.tracks.every(
        (t: unknown): t is GuestPlaylistTrack =>
          t != null &&
          typeof t === "object" &&
          "trackId" in t &&
          "position" in t &&
          typeof (t as GuestPlaylistTrack).trackId === "string" &&
          typeof (t as GuestPlaylistTrack).position === "number",
      );
    });
  } catch {
    // Corrupt JSON or other parse error — return empty
    return [];
  }
}

/**
 * Extract the guest playback state from localStorage.
 *
 * Used to preserve active audio streaming state across registration/sign-in
 * without resetting playback (DEC-005).
 *
 * @param storage — Optional storage provider (defaults to window.localStorage).
 * @returns The parsed GuestPlaybackState, or null if unavailable.
 */
export function extractGuestPlaybackState(
  storage: Storage | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): GuestPlaybackState | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(GUEST_PLAYBACK_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const state = parsed as Partial<GuestPlaybackState>;

    // Must have a valid trackId
    if (typeof state.trackId !== "string" || state.trackId.length === 0) {
      return null;
    }

    // Position must be a non-negative number
    if (typeof state.position !== "number" || state.position < 0) {
      return null;
    }

    return {
      trackId: state.trackId,
      position: state.position,
      playlistId:
        typeof state.playlistId === "string" ? state.playlistId : undefined,
      lastModified: state.lastModified,
    };
  } catch {
    return null;
  }
}

/**
 * Extract all guest session state in one call.
 *
 * Convenience function that returns both playlists and playback state.
 *
 * @param storage — Optional storage provider.
 * @returns GuestSessionData with playlists and playbackState.
 */
export function extractGuestSession(
  storage: Storage | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): GuestSessionData {
  const playlists = extractGuestPlaylists(storage);
  const playbackState = extractGuestPlaybackState(storage);

  return { playlists, playbackState };
}

/**
 * Format a draft playlist into the payload shape expected by the
 * POST /api/v1/playlists endpoint.
 *
 * This is used by client code (e.g., after registration) to build the
 * request body for creating permanent playlist records (AC #2).
 *
 * @param draft — The guest playlist to format.
 * @returns A CreatePlaylistFromGuest object ready for the API.
 */
export function formatGuestPlaylistPayload(draft: GuestPlaylist): CreatePlaylistFromGuest {
  return {
    title: draft.title,
    description: draft.description,
    isPublic: draft.isPublic,
    tracks: draft.tracks,
    userId: "", // caller sets this post-auth
  };
}

/**
 * Build a batch migration payload for all guest playlists.
 *
 * Useful for clients that want to submit all drafts in a single request.
 *
 * @param drafts — Array of draft playlists.
 * @returns Array of formatted payloads (one per draft).
 */
export function formatGuestPlaylistBatch(
  drafts: GuestPlaylist[],
): CreatePlaylistFromGuest[] {
  return drafts.map(formatGuestPlaylistPayload);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sanitise a draft playlist title to prevent XSS.
 * Trims whitespace and limits to 200 characters.
 *
 * @param title — Raw title from localStorage.
 * @returns Sanitised title string.
 */
export function sanitisePlaylistTitle(title: string): string {
  if (typeof title !== "string") {
    return "";
  }
  const trimmed = title.trim();
  return trimmed.slice(0, 200);
}

/**
 * Sanitise a draft playlist description.
 *
 * @param description — Raw description from localStorage.
 * @returns Sanitised description string or undefined.
 */
export function sanitisePlaylistDescription(
  description: string | undefined,
): string | undefined {
  if (typeof description !== "string") {
    return undefined;
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.slice(0, 2000);
}

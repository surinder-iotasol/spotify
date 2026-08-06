/**
 * STORY-track-004: Genre Tagging Validation and Search Indexing Trigger Service
 *
 * - Validates genre field against the normalized platform taxonomy.
 * - Rejects invalid genres with 422 INVALID_GENRE_TAG.
 * - Dispatches post-creation background events to index tracks in the search layer.
 * - Appends new track IDs to the rule-based genre recommendation queue.
 */

import {
  generateId,
  apiSuccessResponse,
} from "@/lib/api/response";

/* ------------------------------------------------------------------ */
/*  Type definitions                                                    */
/* ------------------------------------------------------------------ */

export interface SearchIndexingEvent {
  type: "track_indexed";
  trackId: string;
  title: string;
  artistStageName: string;
  genre: string;
  indexAt: string; // ISO-8601 UTC timestamp
}

export interface GenreRecommendationQueueItem {
  genre: string;
  trackId: string;
  queuedAt: string; // ISO-8601 UTC timestamp
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const VALID_GENRES = [
  "INDIE_ROCK",
  "BEDROOM_POP",
  "ELECTRONIC",
  "HIP_HOP",
  "LO_FI",
  "AMBIENT",
  "R_AND_B",
  "FOLK",
  "OTHER",
] as const;

export const VALID_GENRE_SET: Set<string> = new Set(VALID_GENRES);

export const GENRE_TAG_ERROR_CODE = "INVALID_GENRE_TAG";

/* ------------------------------------------------------------------ */
/*  Genre validation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Validate a genre string against the platform taxonomy.
 * Normalizes the genre to uppercase and trims whitespace before
 * comparing against the canonical enum set.
 *
 * @returns The normalized genre string on success.
 */
export function validateGenreTag(genre: unknown): string {
  const raw = String(genre).trim().toUpperCase();

  if (!VALID_GENRE_SET.has(raw)) {
    // Return a non-null value to signal failure; caller checks truthiness.
    throw new Error(
      `Invalid genre tag: ${genre}. Must be one of: ${VALID_GENRES.join(", ")}`,
    );
  }

  return raw;
}

/**
 * Safe version that returns a flag instead of throwing.
 */
export function isValidGenreTag(genre: unknown): boolean {
  try {
    validateGenreTag(genre);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a structured error detail for an invalid genre.
 */
export function genreValidationErrortDetail(
  genre: unknown,
): { code: string; path: string[]; message: string } {
  return {
    code: GENRE_TAG_ERROR_CODE,
    path: ["genre"],
    message: `Invalid genre tag: "${genre}". Must be one of: ${VALID_GENRES.join(", ")}`,
  };
}

/* ------------------------------------------------------------------ */
/*  Search indexing event dispatcher                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a search indexing event payload from track data.
 * Callers pass the title, artist stage name, and normalized genre
 * after validation.
 */
export function buildSearchIndexingEvent(
  trackId: string,
  title: string,
  artistStageName: string,
  genre: string,
): SearchIndexingEvent {
  return {
    type: "track_indexed",
    trackId,
    title,
    artistStageName,
    genre,
    indexAt: new Date().toISOString(),
  };
}

/**
 * Dispatch the indexing event asynchronously.
 * In production this would push to an SQS / PubSub queue.
 * For now we invoke a registered handler (if any).
 */

type IndexingEventHandler = (event: SearchIndexingEvent) => Promise<void>;

let _indexHandler: IndexingEventHandler | null = null;

export function registerIndexHandler(handler: IndexingEventHandler): void {
  _indexHandler = handler;
}

export async function dispatchSearchIndexEvent(
  event: SearchIndexingEvent,
): Promise<void> {
  // Fire-and-forget in production: wrap in unhandled rejection
  if (_indexHandler) {
    await _indexHandler(event);
  }
}

/**
 * Convenience wrapper: validate genre, build event, and dispatch.
 */
export async function indexTrackAfterCreate(
  trackId: string,
  title: string,
  artistStageName: string,
  genre: unknown,
): Promise<SearchIndexingEvent> {
  const normalizedGenre = validateGenreTag(genre);
  const event = buildSearchIndexingEvent(trackId, title, artistStageName, normalizedGenre);
  await dispatchSearchIndexEvent(event);
  return event;
}

/* ------------------------------------------------------------------ */
/*  Genre recommendation queue                                         */
/* ------------------------------------------------------------------ */

/**
 * Appendix an item to the genre-based recommendation queue.
 * Returns the persisted queue snapshot.
 */
export function appendGenreQueueItem(
  genre: string,
  trackId: string,
): GenreRecommendationQueueItem {
  if (!VALID_GENRE_SET.has(genre)) {
    throw new Error(`Cannot queue track for invalid genre: ${genre}`);
  }

  return {
    genre,
    trackId,
    queuedAt: new Date().toISOString(),
  };
}

/**
 * Stub: append to a database-backed queue collection.
 * In production this would call MongoDB / Redis LPUSH or similar.
 */
export async function persistGenreQueueItem(
  item: GenreRecommendationQueueItem,
): Promise<void> {
  // Stub – would push to DB / message queue in production.
}

/**
 * Full pipeline: validate, build indexing event, dispatch, and queue.
 */
export async function processTrackPostCreation(
  trackId: string,
  title: string,
  artistStageName: string,
  genre: unknown,
): Promise<{
  indexingEvent: SearchIndexingEvent;
  queueItem: GenreRecommendationQueueItem;
}> {
  const normalizedGenre = validateGenreTag(genre);

  // Build and dispatch search indexing event.
  const indexingEvent = buildSearchIndexingEvent(
    trackId,
    title,
    artistStageName,
    normalizedGenre,
  );
  await dispatchSearchIndexEvent(indexingEvent);

  // Append to genre recommendation queue.
  const queueItem = appendGenreQueueItem(normalizedGenre, trackId);
  await persistGenreQueueItem(queueItem);

  return { indexingEvent, queueItem };
}

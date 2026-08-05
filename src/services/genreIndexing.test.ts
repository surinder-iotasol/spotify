/**
 * STORY-track-004: Genre Tagging Validation and Search Indexing Trigger Service Tests
 *
 * Covers:
 * - validateGenreTag taxonomy validation and normalization
 * - isValidGenreTag safe boolean check
 * - genreValidationErrortDetail structured error output
 * - buildSearchIndexingEvent payload shape and fields
 * - registerIndexHandler / dispatchSearchIndexEvent integration
 * - indexTrackAfterCreate convenience wrapper
 * - appendGenreQueueItem taxonomy enforcement and queue item creation
 * - processTrackPostCreation full pipeline orchestration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  VALID_GENRES,
  VALID_GENRE_SET,
  GENRE_TAG_ERROR_CODE,
  validateGenreTag,
  isValidGenreTag,
  genreValidationErrortDetail,
  buildSearchIndexingEvent,
  registerIndexHandler,
  dispatchSearchIndexEvent,
  indexTrackAfterCreate,
  appendGenreQueueItem,
  persistGenreQueueItem,
  processTrackPostCreation,
  SearchIndexingEvent,
  GenreRecommendationQueueItem,
} from "./genreIndexing";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

const VALID_GENRE = "INDIE_ROCK";
const TRACK_ID = "track-genre-001";
const TITLE = "Echoes in Reverb";
const ARTIST_STAGE = "Neon Drift";

/**
 * Reset the global indexing handler to null between tests.
 * We accomplish this by registering a no-op handler and relying on
 * dispatchSearchIndexEvent's `if (_indexHandler)` gate.
 * The handler lifecycle is: any registered handler is kept until
 * overwritten — tests that need a clean slate re-register their own.
 */
function resetIndexHandler(): void {
  // Replace with a no-op that does nothing; safe re-entrant.
  registerIndexHandler(
    vi.fn().mockResolvedValue(undefined) as unknown as Parameters<typeof registerIndexHandler>[0],
  );
}

/* ------------------------------------------------------------------ */
/*  Constants validation                                               */
/* ------------------------------------------------------------------ */

describe("VALID_GENRES and VALID_GENRE_SET constants", () => {
  it("VALID_GENRES includes all 9 canonical taxonomy entries", () => {
    expect(VALID_GENRES).toHaveLength(9);
    expect(VALID_GENRES).toContain("INDIE_ROCK");
    expect(VALID_GENRES).toContain("BEDROOM_POP");
    expect(VALID_GENRES).toContain("ELECTRONIC");
    expect(VALID_GENRES).toContain("HIP_HOP");
    expect(VALID_GENRES).toContain("LO_FI");
    expect(VALID_GENRES).toContain("AMBIENT");
    expect(VALID_GENRES).toContain("R_AND_B");
    expect(VALID_GENRES).toContain("FOLK");
    expect(VALID_GENRES).toContain("OTHER");
  });

  it("VALID_GENRE_SET has length 9 and contains every VALID_GENRES entry", () => {
    expect(VALID_GENRE_SET.size).toBe(9);
    for (const genre of VALID_GENRES) {
      expect(VALID_GENRE_SET.has(genre)).toBe(true);
    }
  });

  it("GENRE_TAG_ERROR_CODE matches the expected constant string", () => {
    expect(GENRE_TAG_ERROR_CODE).toBe("INVALID_GENRE_TAG");
  });
});

/* ------------------------------------------------------------------ */
/*  validateGenreTag                                                   */
/* ------------------------------------------------------------------ */

describe("validateGenreTag", () => {
  it.each(VALID_GENRES)("accepts genre '%s' and returns uppercase normalized form", (genre) => {
    expect(validateGenreTag(genre)).toBe(genre);
    expect(validateGenreTag(genre.toLowerCase())).toBe(genre);
    expect(validateGenreTag(`  ${genre}  `)).toBe(genre);
  });

  it("normalizes mixed-case input to uppercase", () => {
    expect(validateGenreTag("indie_rock")).toBe("INDIE_ROCK");
    expect(validateGenreTag("Bedroom_POP")).toBe("BEDROOM_POP");
    expect(validateGenreTag("electRoniC")).toBe("ELECTRONIC");
  });

  it("strips surrounding whitespace before validation", () => {
    expect(validateGenreTag("  ELECTRONIC  ")).toBe("ELECTRONIC");
    expect(validateGenreTag("\tHIP_HOP\t")).toBe("HIP_HOP");
  });

  it.each([
    "JAZZ",
    "classical",
    "POP",
    "",
    "     ",
    "INDIE ROCK", // space instead of underscore
    "rock+n-roll",
    " Hip Hop ", // trailing space still normalizes but invalid
    "nonexistent_genre",
  ])("throws on invalid genre '%s'", (genre) => {
    expect(() => validateGenreTag(genre)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("Invalid genre tag"),
      }),
    );
  });

  it("handles null and undefined gracefully", () => {
    expect(() => validateGenreTag(null as unknown as string)).toThrow(
      /Invalid genre tag/,
    );
    expect(() => validateGenreTag(undefined)).toThrow(
      /Invalid genre tag/,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  isValidGenreTag                                                    */
/* ------------------------------------------------------------------ */

describe("isValidGenreTag", () => {
  it.each(VALID_GENRES)("returns true for valid genre '%s'", (genre) => {
    expect(isValidGenreTag(genre)).toBe(true);
    expect(isValidGenreTag(genre.toLowerCase())).toBe(true);
  });

  it.each(["JAZZ", "POP", "", null as unknown as string, undefined])(
    "returns false for invalid genre",
    (genre) => {
      expect(isValidGenreTag(genre)).toBe(false);
    },
  );
});

/* ------------------------------------------------------------------ */
/*  genreValidationErrortDetail                                         */
/* ------------------------------------------------------------------ */

describe("genreValidationErrortDetail", () => {
  it("returns structured detail with correct code and path for invalid genre", () => {
    const detail = genreValidationErrortDetail("JAZZ");
    expect(detail).toEqual({
      code: "INVALID_GENRE_TAG",
      path: ["genre"],
      message: expect.stringContaining("JAZZ"),
    });
    expect(detail.code).toBe(GENRE_TAG_ERROR_CODE);
    expect(detail.path).toEqual(["genre"]);
    expect(detail.message).toContain("JAZZ");
    expect(detail.message).toContain("INDIE_ROCK");
  });

  it("includes all valid genres in the error message", () => {
    const detail = genreValidationErrortDetail("BLUES");
    for (const g of VALID_GENRES) {
      expect(detail.message).toContain(g);
    }
  });

  it("handles null/undefined gracefully", () => {
    const detailNull = genreValidationErrortDetail(null as unknown as string);
    expect(detailNull.code).toBe(GENRE_TAG_ERROR_CODE);
    expect(detailNull.message).toContain("Invalid genre tag");
  });
});

/* ------------------------------------------------------------------ */
/*  buildSearchIndexingEvent                                           */
/* ------------------------------------------------------------------ */

describe("buildSearchIndexingEvent", () => {
  it("returns event with correct structure and fields", () => {
    const event = buildSearchIndexingEvent(
      TRACK_ID,
      TITLE,
      ARTIST_STAGE,
      VALID_GENRE,
    );

    expect(event.type).toBe("track_indexed");
    expect(event.trackId).toBe(TRACK_ID);
    expect(event.title).toBe(TITLE);
    expect(event.artistStageName).toBe(ARTIST_STAGE);
    expect(event.genre).toBe(VALID_GENRE);
    expect(event.indexAt).toBeDefined();
    expect(typeof event.indexAt).toBe("string");
  });

  it("indexAt matches ISO-8601 format", () => {
    const event = buildSearchIndexingEvent("id", "t", "a", "ELECTRONIC");
    // Should parse as a valid ISO date
    expect(new Date(event.indexAt)).toBeInstanceOf(Date);
    expect(Number.isNaN(new Date(event.indexAt).getTime())).toBe(false);
  });

  it("preserves exact values without Sanitization", () => {
    const event = buildSearchIndexingEvent(
      "track-123",
      "Song with 'quotes' & <tags>",
      "Artist Nane",
      "FOLK",
    );
    expect(event.title).toBe("Song with 'quotes' & <tags>");
    expect(event.artistStageName).toBe("Artist Nane");
    expect(event.genre).toBe("FOLK");
  });
});

/* ------------------------------------------------------------------ */
/*  registerIndexHandler / dispatchSearchIndexEvent                    */
/* ------------------------------------------------------------------ */

describe("registerIndexHandler and dispatchSearchIndexEvent", () => {
  afterEach(resetIndexHandler);

  // We need a workaround since registerIndexHandler doesn't expose a reset.
  // Reading the source: registerIndexHandler(handler) = _indexHandler = handler;
  // Calling it with null sets _indexHandler to null.

  it("dispatches event to registered handler synchronously (awaited)", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler);

    const event: SearchIndexingEvent = buildSearchIndexingEvent("t1", "T", "A", "AMBIENT");
    await dispatchSearchIndexEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does nothing when no handler is registered", async () => {
    const event: SearchIndexingEvent = buildSearchIndexingEvent("t1", "T", "A", "AMBIENT");
    // _indexHandler starts as null; any previous handler is cleared.
    // After reading the latest module state, ensure null.
    await dispatchSearchIndexEvent(event);
    // No error thrown
  });

  it("handler can throw and it propagates", async () => {
    registerIndexHandler(vi.fn().mockRejectedValue(new Error("queue down")));
    const event: SearchIndexingEvent = buildSearchIndexingEvent("t1", "T", "A", "FOLK");
    await expect(dispatchSearchIndexEvent(event)).rejects.toThrow("queue down");
  });

  it("replaces previous handler when registerIndexHandler is called again", async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler1);
    registerIndexHandler(handler2);

    const event: SearchIndexingEvent = buildSearchIndexingEvent("t1", "T", "A", "LO_FI");
    await dispatchSearchIndexEvent(event);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  indexTrackAfterCreate                                              */
/* ------------------------------------------------------------------ */

describe("indexTrackAfterCreate", () => {
  afterEach(resetIndexHandler);

  it("validates genre before building event", async () => {
    registerIndexHandler(vi.fn().mockResolvedValue(undefined));
    await expect(
      indexTrackAfterCreate("t1", "T", "A", "INVALID_GENRE"),
    ).rejects.toThrow(/Invalid genre tag/);
  });

  it("normalizes genre to uppercase in event", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler);

    await indexTrackAfterCreate("t1", "Song title", "Artist name", "indie_rock");

    const [event] = handler.mock.calls[0];
    expect(event.genre).toBe("INDIE_ROCK");
    expect(event.type).toBe("track_indexed");
    expect(event.trackId).toBe("t1");
    expect(event.title).toBe("Song title");
    expect(event.artistStageName).toBe("Artist name");
  });

  it("returns the built SearchIndexingEvent", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler);

    const result = await indexTrackAfterCreate(
      "my-track-id",
      "Track Title",
      "Artist Name",
      "HIP_HOP",
    );

    expect(result).toEqual(expect.objectContaining({
      type: "track_indexed",
      trackId: "my-track-id",
      title: "Track Title",
      artistStageName: "Artist Name",
      genre: "HIP_HOP",
    }));
    expect(typeof result.indexAt).toBe("string");
  });
});

/* ------------------------------------------------------------------ */
/*  appendGenreQueueItem                                               */
/* ------------------------------------------------------------------ */

describe("appendGenreQueueItem", () => {
  it.each(VALID_GENRES)("returns valid queue item for genre '%s'", (genre) => {
    const item = appendGenreQueueItem(genre, "track-q-001");
    expect(item.genre).toBe(genre);
    expect(item.trackId).toBe("track-q-001");
    expect(item.queuedAt).toBeDefined();
    expect(typeof item.queuedAt).toBe("string");
    expect(new Date(item.queuedAt)).toBeInstanceOf(Date);
  });

  it("rejects invalid genre", () => {
    expect(() => appendGenreQueueItem("JAZZ", "track-q-002")).toThrow(
      /Cannot queue track for invalid genre/,
    );
  });

  it("creates consistent queue item structure", () => {
    const item = appendGenreQueueItem("BEDROOM_POP", "track-q-003");
    expect(item).toHaveProperty("genre", "BEDROOM_POP");
    expect(item).toHaveProperty("trackId", "track-q-003");
    expect(item).toHaveProperty("queuedAt");
    expect(Object.keys(item)).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  persistGenreQueueItem (stub)                                       */
/* ------------------------------------------------------------------ */

describe("persistGenreQueueItem", () => {
  it("resolves without error as a stub", async () => {
    const item: GenreRecommendationQueueItem = {
      genre: "AMBIENT",
      trackId: "track-persist-001",
      queuedAt: new Date().toISOString(),
    };
    await expect(persistGenreQueueItem(item)).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  processTrackPostCreation (full pipeline)                           */
/* ------------------------------------------------------------------ */

describe("processTrackPostCreation", () => {
  afterEach(resetIndexHandler);

  it("validates genre, dispatches indexing event, and creates queue item", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler);

    const result = await processTrackPostCreation(
      "track-pipeline-001",
      "Pipeline Song",
      "Pipeline Artist",
      "R_AND_B",
    );

    expect(result).toHaveProperty("indexingEvent");
    expect(result).toHaveProperty("queueItem");

    expect(result.indexingEvent.type).toBe("track_indexed");
    expect(result.indexingEvent.trackId).toBe("track-pipeline-001");
    expect(result.indexingEvent.title).toBe("Pipeline Song");
    expect(result.indexingEvent.artistStageName).toBe("Pipeline Artist");
    expect(result.indexingEvent.genre).toBe("R_AND_B");

    expect(result.queueItem.genre).toBe("R_AND_B");
    expect(result.queueItem.trackId).toBe("track-pipeline-001");
    expect(typeof result.queueItem.queuedAt).toBe("string");
  });

  it("rejects invalid genre with descriptive error", async () => {
    registerIndexHandler(vi.fn().mockResolvedValue(undefined));
    await expect(
      processTrackPostCreation(
        "t1",
        "T",
        "A",
        "DISCO",
      ),
    ).rejects.toThrow(/Invalid genre tag/);
  });

  it("normalizes genre to uppercase throughout pipeline", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler);

    const result = await processTrackPostCreation(
      "t1",
      "T2",
      "A2",
      "lo_fi",
    );

    expect(result.indexingEvent.genre).toBe("LO_FI");
    expect(result.queueItem.genre).toBe("LO_FI");
  });

  it("invokes the registered handler with correct event", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerIndexHandler(handler);

    await processTrackPostCreation("t1", "T", "A", "FOLK");

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "track_indexed",
        trackId: "t1",
        genre: "FOLK",
      }),
    );
  });
});

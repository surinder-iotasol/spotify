/**
 * STORY-security-004: Unit tests for resource ownership verification helpers.
 *
 * Covers:
 *  - Track ownership: artistProfileId match or ADMIN override
 *  - Playlist ownership: userId match or ADMIN override
 *  - Failed ownership checks return HTTP 403 with code ERR_RESOURCE_OWNERSHIP_DENIED
 *  - Admin role overrides ownership restrictions for both Track and Playlist
 *  - Response structure compliance for integration tests
 */

import { describe, it, expect } from "vitest";
import {
  checkTrackOwnership,
  checkPlaylistOwnership,
  isOwnershipError,
  OwnershipError,
  type OwnershipCheckParams,
  type ResourceWithOwner,
  type OwnershipErrorResponse,
} from "./ownership";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function makeTrack(artistProfileId: string): { id: string; artistProfileId: string } {
  return { id: "track-1", artistProfileId };
}

function makePlaylist(userId: string): { id: string; userId: string } {
  return { id: "playlist-1", userId };
}

/* ------------------------------------------------------------------ */
/*  checkTrackOwnership                                                */
/* ------------------------------------------------------------------ */

describe("checkTrackOwnership", () => {
  it("returns success when artistProfileId matches caller's artistProfileId", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "user-1", role: "ARTIST", artistProfileId: "ap-100" },
    };

    const result = checkTrackOwnership(params);
    expect(isOwnershipError(result)).toBe(false);
  });

  it("returns success when caller is ADMIN regardless of ownership", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "admin-1", role: "ADMIN", artistProfileId: "ap-999" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toEqual({ authorized: true });
  });

  it("returns 403 OwnershipError when artistProfileId does not match", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "user-2", role: "ARTIST", artistProfileId: "ap-200" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(err.message).toContain("Track");
    expect(err.resourceId).toBe("track-1");
    expect(err.resourceType).toBe("track");
  });

  it("returns 403 when caller is LISTENER and does not own the track", () => {
    const track = makeTrack("ap-100");
    // LISTENER with no artistProfileId field
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "user-3", role: "LISTENER" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
  });

  it("includes detailed resource info in the error response for integration tests", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "user-2", role: "ARTIST", artistProfileId: "ap-200" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;

    // Structured response that integration tests can assert on
    const errResponse: OwnershipErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      meta: {
        resourceId: err.resourceId ?? "unknown",
        resourceType: err.resourceType ?? "unknown",
        requiredOwnership: err.ownerField ?? "unknown",
      },
    };

    expect(errResponse.error.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(errResponse.meta.resourceId).toBe("track-1");
    expect(errResponse.meta.resourceType).toBe("track");
    expect(errResponse.meta.requiredOwnership).toBe("artistProfileId");
  });

  it("throws OwnershipError when resource is missing the owner field", () => {
    const badTrack: ResourceWithOwner = { id: "track-2" };
    const params: OwnershipCheckParams = {
      resource: badTrack,
      ownerField: "artistProfileId",
      caller: { userId: "user-1", role: "ARTIST", artistProfileId: "ap-100" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
  });

  it("allows ADMIN to bypass ownership for a track they do not own", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "admin-1", role: "ADMIN", artistProfileId: "ap-missing" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toEqual({ authorized: true });
  });
});

/* ------------------------------------------------------------------ */
/*  checkPlaylistOwnership                                             */
/* ------------------------------------------------------------------ */

describe("checkPlaylistOwnership", () => {
  it("returns success when userId matches caller's userId", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "user-100", role: "LISTENER" },
    };

    const result = checkPlaylistOwnership(params);
    expect(isOwnershipError(result)).toBe(false);
  });

  it("returns success when caller is ADMIN regardless of ownership", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "admin-1", role: "ADMIN" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toEqual({ authorized: true });
  });

  it("returns 403 OwnershipError when userId does not match", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "user-200", role: "LISTENER" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(err.message).toContain("Playlist");
    expect(err.resourceId).toBe("playlist-1");
    expect(err.resourceType).toBe("playlist");
  });

  it("includes detailed resource info in the error response for integration tests", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "user-200", role: "LISTENER" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;

    const errResponse: OwnershipErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      meta: {
        resourceId: err.resourceId ?? "unknown",
        resourceType: err.resourceType ?? "unknown",
        requiredOwnership: err.ownerField ?? "unknown",
      },
    };

    expect(errResponse.error.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(errResponse.meta.resourceId).toBe("playlist-1");
    expect(errResponse.meta.resourceType).toBe("playlist");
    expect(errResponse.meta.requiredOwnership).toBe("userId");
  });

  it("throws OwnershipError when resource is missing the owner field", () => {
    const badPlaylist = { id: "playlist-2" } as unknown as { id: string; userId: string };
    const params: OwnershipCheckParams = {
      resource: badPlaylist,
      ownerField: "userId",
      caller: { userId: "user-1", role: "LISTENER" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
  });

  it("allows ADMIN to bypass ownership for a playlist they do not own", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "admin-1", role: "ADMIN" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toEqual({ authorized: true });
  });

  it("rejects a LISTENER trying to edit another user's playlist", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "user-200", role: "LISTENER" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
  });

  it("rejects an ARTIST trying to edit another user's playlist", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "artist-1", role: "ARTIST" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
  });
});

/* ------------------------------------------------------------------ */
/*  OwnershipError class                                               */
/* ------------------------------------------------------------------ */

describe("OwnershipError", () => {
  it("sets correct name property", () => {
    const err = new OwnershipError(403, "ERR_RESOURCE_OWNERSHIP_DENIED", "Access denied");
    expect(err.name).toBe("OwnershipError");
  });

  it("exposes status, code, and message", () => {
    const err = new OwnershipError(403, "ERR_RESOURCE_OWNERSHIP_DENIED", "You do not own this resource");
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(err.message).toBe("You do not own this resource");
  });

  it("includes resourceId and resourceType when provided", () => {
    const err = new OwnershipError(
      403,
      "ERR_RESOURCE_OWNERSHIP_DENIED",
      "Access denied",
      "track-1",
      "track",
      "artistProfileId",
    );
    expect(err.resourceId).toBe("track-1");
    expect(err.resourceType).toBe("track");
    expect(err.ownerField).toBe("artistProfileId");
  });

  it("toJSON produces a serializable object with all fields", () => {
    const err = new OwnershipError(
      403,
      "ERR_RESOURCE_OWNERSHIP_DENIED",
      "Access denied",
      "playlist-1",
      "playlist",
      "userId",
    );
    const json = err.toJSON();
    expect(json).toMatchObject({
      success: false,
      error: {
        code: "ERR_RESOURCE_OWNERSHIP_DENIED",
        message: "Access denied",
      },
      meta: {
        resourceId: "playlist-1",
        resourceType: "playlist",
        requiredOwnership: "userId",
      },
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: HTTP 403 response structure assertions               */
/* ------------------------------------------------------------------ */

describe("Integration: HTTP 403 response structure", () => {
  it("Track ownership failure returns structured error for integration test assertion", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "user-99", role: "ARTIST", artistProfileId: "ap-999" },
    };

    const result = checkTrackOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;

    // Integration test can assert the response structure matches HTTP 403 contract
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(err.message).toBeDefined();
    expect(typeof err.message).toBe("string");
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.resourceId).toBe("track-1");
    expect(err.resourceType).toBe("track");
  });

  it("Playlist ownership failure returns structured error for integration test assertion", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "user-99", role: "LISTENER" },
    };

    const result = checkPlaylistOwnership(params);
    expect(result).toBeInstanceOf(OwnershipError);
    const err = result as OwnershipError;

    // Integration test can assert the response structure matches HTTP 403 contract
    expect(err.status).toBe(403);
    expect(err.code).toBe("ERR_RESOURCE_OWNERSHIP_DENIED");
    expect(err.message).toBeDefined();
    expect(typeof err.message).toBe("string");
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.resourceId).toBe("playlist-1");
    expect(err.resourceType).toBe("playlist");
  });

  it("Track ADMIN bypass works correctly in integration scenario", () => {
    const track = makeTrack("ap-100");
    const params: OwnershipCheckParams = {
      resource: track,
      ownerField: "artistProfileId",
      caller: { userId: "admin-1", role: "ADMIN" },
    };

    const result = checkTrackOwnership(params);
    // Admin should get { authorized: true } — not an error
    expect(result).toEqual({ authorized: true });
  });

  it("Playlist ADMIN bypass works correctly in integration scenario", () => {
    const playlist = makePlaylist("user-100");
    const params: OwnershipCheckParams = {
      resource: playlist,
      ownerField: "userId",
      caller: { userId: "admin-1", role: "ADMIN" },
    };

    const result = checkPlaylistOwnership(params);
    // Admin should get { authorized: true } — not an error
    expect(result).toEqual({ authorized: true });
  });
});

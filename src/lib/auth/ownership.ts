/**
 * Resource ownership verification helpers for IDOR (Insecure Direct Object Reference) protection.
 *
 * Reusable authorization functions used by REST API route handlers to enforce that
 * users can only modify or delete their own Track and Playlist records, unless they
 * hold the ADMIN role.
 *
 * Usage in route handlers:
 *   const result = checkTrackOwnership({ resource: track, ownerField: "artistProfileId", caller });
 *   if (result instanceof OwnershipError) {
 *     return NextResponse.json(toJsonErrorResponse(result), { status: 403 });
 *   }
 *
 *   const result = checkPlaylistOwnership({ resource: playlist, ownerField: "userId", caller });
 *   if (result instanceof OwnershipError) {
 *     return NextResponse.json(toJsonErrorResponse(result), { status: 403 });
 *   }
 *
 * Stories: STORY-security-004
 */

import type { UserRole } from "./index";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Minimal shape of an authenticated caller extracted from session claims.
 * The caller must carry userId, role, and optionally artistProfileId.
 */
export interface Caller {
  userId: string;
  role: UserRole;
  artistProfileId?: string;
}

/**
 * Resource must have the given owner field for ownership comparison.
 */
export interface ResourceWithOwner {
  id: string;
  [ownerField: string]: unknown;
}

/**
 * Parameters passed to ownership-check helper functions.
 */
export interface OwnershipCheckParams {
  resource: ResourceWithOwner;
  ownerField: string;
  caller: Caller;
}

/**
 * Result of an ownership check.
 * - `{ authorized: true }` when the caller is permitted.
 * - `OwnershipError` (subclass) when the caller is denied.
 */
export type OwnershipCheckResult = { authorized: true } | OwnershipError;

/**
 * Structured error response that can be serialized to JSON and returned
 * as an HTTP 403 Forbidden body. Used by integration tests to assert
 * response structure.
 */
export interface OwnershipErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    resourceId: string;
    resourceType: string;
    requiredOwnership: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Machine-readable error code for ownership-denied failures.
 */
export const OWNERSHIP_ERROR_CODE = "ERR_RESOURCE_OWNERSHIP_DENIED";

/**
 * Human-readable message returned when ownership verification fails.
 * @param resourceName — Display name of the resource (e.g. "Track", "Playlist").
 * @param resourceId   — The resource ID the caller attempted to access.
 * @param ownerField   — The field that must match (e.g. "artistProfileId", "userId").
 */
function ownershipDeniedMessage(
  resourceName: string,
  resourceId: string,
  ownerField: string,
): string {
  return `You do not have permission to modify ${resourceName} ${resourceId}. The "${ownerField}" must match your identity.`;
}

/* ------------------------------------------------------------------ */
/*  OwnershipError                                                     */
/* ------------------------------------------------------------------ */

/**
 * Structured error thrown when an ownership check fails.
 *
 * Carries the HTTP status code (always 403), a machine-readable error code,
 * the human-readable message, and the resource metadata needed by callers
 * to construct an HTTP response body.
 *
 * Integrations: route handlers can convert this to a JSON response with:
 *   const errorResponse: OwnershipErrorResponse = {
 *     success: false,
 *     error: { code: err.code, message: err.message },
 *     meta: { resourceId: err.resourceId, resourceType: err.resourceType, requiredOwnership: err.ownerField },
 *   };
 */
export class OwnershipError extends Error {
  name = "OwnershipError";

  constructor(
    public status: number,
    public code: string,
    message: string,
    public resourceId?: string,
    public resourceType?: string,
    public ownerField?: string,
  ) {
    super(message);
    this.name = "OwnershipError";
  }

  /**
   * Serialize the error to a plain object suitable for JSON.stringify.
   * Strips the prototype chain so the error can be safely embedded in
   * API response bodies.
   */
  toJSON(): OwnershipErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
      },
      meta: {
        resourceId: this.resourceId ?? "unknown",
        resourceType: this.resourceType ?? "unknown",
        requiredOwnership: this.ownerField ?? "unknown",
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Core ownership check                                               */
/* ------------------------------------------------------------------ */

/**
 * Shared ownership-check logic used by both checkTrackOwnership and
 * checkPlaylistOwnership.
 *
 * Decision tree:
 *   1. If caller.role === "ADMIN" → authorized (admin override).
 *   2. If resource.ownerField === caller.{ownerField} → authorized.
 *   3. Otherwise → return OwnershipError(403, ERR_RESOURCE_OWNERSHIP_DENIED, …).
 *
 * @param params — Resource, owner field name, and authenticated caller.
 * @returns `{ authorized: true }` or an `OwnershipError` with HTTP 403.
 */
function checkOwnership(params: OwnershipCheckParams): OwnershipCheckResult {
  const { resource, ownerField, caller } = params;

  // Admin role bypasses all ownership restrictions
  if (caller.role === "ADMIN") {
    return { authorized: true };
  }

  // Verify the resource has the required owner field
  const resourceOwnerId = resource[ownerField];
  if (resourceOwnerId === undefined || resourceOwnerId === null) {
    return new OwnershipError(
      403,
      OWNERSHIP_ERROR_CODE,
      ownershipDeniedMessage(
        resource.id ?? "unknown",
        resource.id ?? "unknown",
        ownerField,
      ),
      resource.id,
      undefined,
      ownerField,
    );
  }

  // For artist-profile–bound resources (Tracks), compare against artistProfileId
  // For user-bound resources (Playlists), compare against userId
  if (ownerField === "artistProfileId") {
    if (resourceOwnerId !== caller.artistProfileId) {
      return new OwnershipError(
        403,
        OWNERSHIP_ERROR_CODE,
        ownershipDeniedMessage(
          "Track",
          resource.id ?? "unknown",
          ownerField,
        ),
        resource.id,
        "track",
        ownerField,
      );
    }
  } else if (ownerField === "userId") {
    if (resourceOwnerId !== caller.userId) {
      return new OwnershipError(
        403,
        OWNERSHIP_ERROR_CODE,
        ownershipDeniedMessage(
          "Playlist",
          resource.id ?? "unknown",
          ownerField,
        ),
        resource.id,
        "playlist",
        ownerField,
      );
    }
  } else {
    // Generic owner field comparison for extensibility
    if (resourceOwnerId !== (caller as unknown as Record<string, unknown>)[ownerField]) {
      return new OwnershipError(
        403,
        OWNERSHIP_ERROR_CODE,
        `You do not have permission to access resource ${resource.id ?? "unknown"}. Ownership required.`,
        resource.id,
        undefined,
        ownerField,
      );
    }
  }

  return { authorized: true };
}

/**
 * Type guard to narrow OwnershipCheckResult to OwnershipError.
 */
export function isOwnershipError(
  result: OwnershipCheckResult,
): result is OwnershipError {
  return result instanceof OwnershipError;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Verify that the caller owns (or is an admin for) the given Track.
 *
 * A Track is owned by the caller when:
 *   - caller.role is "ADMIN", OR
 *   - Track.artistProfileId === caller.artistProfileId
 *
 * On failure, returns an OwnershipError(403, ERR_RESOURCE_OWNERSHIP_DENIED, …).
 *
 * @param params — The track resource, owner field ("artistProfileId"), and caller.
 * @returns `{ authorized: true }` or an OwnershipError.
 */
export function checkTrackOwnership(params: OwnershipCheckParams): OwnershipCheckResult {
  return checkOwnership({ ...params, ownerField: "artistProfileId" });
}

/**
 * Verify that the caller owns (or is an admin for) the given Playlist.
 *
 * A Playlist is owned by the caller when:
 *   - caller.role is "ADMIN", OR
 *   - Playlist.userId === caller.userId
 *
 * On failure, returns an OwnershipError(403, ERR_RESOURCE_OWNERSHIP_DENIED, …).
 *
 * @param params — The playlist resource, owner field ("userId"), and caller.
 * @returns `{ authorized: true }` or an OwnershipError.
 */
export function checkPlaylistOwnership(params: OwnershipCheckParams): OwnershipCheckResult {
  return checkOwnership({ ...params, ownerField: "userId" });
}

/* ------------------------------------------------------------------ */
/*  Utility: build API response body                                   */
/* ------------------------------------------------------------------ */

/**
 * Convert an OwnershipError into a JSON-serializable API error response
 * body. Route handlers can use this to construct their NextResponse:
 *
 *   if (result instanceof OwnershipError) {
 *     return NextResponse.json(toJsonErrorResponse(result), { status: 403 });
 *   }
 */
export function toJsonErrorResponse(err: OwnershipError): OwnershipErrorResponse {
  return err.toJSON();
}

/**
 * STORY-profile-002: PATCH /api/v1/artist-profile
 *
 * Allows creators with the ARTIST role to update their branding metadata.
 * Validates payload fields against strict schema constraints.
 *
 * HTTP status codes:
 *  200 — Profile updated successfully
 *  401 — UNAUTHENTICATED (no valid session)
 *  403 — FORBIDDEN_INSUFFICIENT_ROLE (not an ARTIST)
 *  422 — Payload validation failure (INVALID_DISPLAY_NAME, BIO_TOO_LONG, INVALID_SOCIAL_LINKS)
 *  500 — Internal server error
 */

import { type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  validateArtistProfileUpdate,
  ARTIST_PROFILE_VALIDATION_ERRORS,
  type ArtistProfileUpdateInput,
} from "@/validators/artistProfile";
import { validateBody } from "@/lib/api/validation";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import {
  verifyToken,
  SESSION_COOKIE_NAME,
  TokenError,
} from "@/lib/auth";
import { logRequestBody } from "@/lib/auth/logging";
import {
  uploadProfileImage,
  PROFILE_IMAGE_ERRORS,
  type ArtistProfileRepository,
} from "@/services/profileImageUpload";
import { parseMultipartImage } from "@/middleware/multipartUpload";

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

const ERROR_CODES = {
  ...ARTIST_PROFILE_VALIDATION_ERRORS,
  USER_NOT_FOUND: "USER_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function PATCH(request: NextRequest) {
  // 0. Log the request body (sanitized)
  const { originalBody: body } = await logRequestBody(request, "artist-profile-update");

  // 1. Guard: reject if body could not be parsed
  if (body == null) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "VALIDATION_BODY_EMPTY",
          "Invalid or empty request body.",
        ),
      ),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Extract and verify the session token from the cookie
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = extractSessionToken(cookieHeader);

  if (!sessionToken) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          ERROR_CODES.USER_NOT_FOUND,
          "Unauthenticated. A valid session is required.",
        ),
      ),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let verified: { userId: string; role: string };
  try {
    verified = verifyToken(sessionToken);
  } catch {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          ERROR_CODES.USER_NOT_FOUND,
          "Session token is invalid or has expired.",
        ),
      ),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 3. Enforce ARTIST role authorization
  if (verified.role !== "ARTIST") {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "FORBIDDEN_INSUFFICIENT_ROLE",
          "ARTIST role is required to update artist profile.",
        ),
      ),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 4. Validate against artist profile update schema
  const result = validateArtistProfileUpdate(body);

  if (!result.ok) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          result.error.code,
          result.error.message,
          [
            {
              code: result.error.code,
              path: result.error.path,
              message: result.error.message,
            },
          ],
        ),
      ),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const parsed: ArtistProfileUpdateInput = result.data;

  // 5. Ensure user has an ArtistProfile linked
  const artistProfile = await prisma.artistProfile.findUnique({
    where: { userId: verified.userId },
  });

  if (!artistProfile) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          ERROR_CODES.USER_NOT_FOUND,
          "Artist profile not found. Upgrade to artist role first.",
        ),
      ),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 6. Build the update data (only include fields that were provided)
  const updateData: Record<string, unknown> = {};

  if (parsed.displayName !== undefined) {
    updateData.stageName = parsed.displayName;
  }

  if (parsed.bio !== undefined) {
    updateData.bio = parsed.bio;
  }

  if (parsed.socialLinks !== undefined) {
    updateData.socialLinks = parsed.socialLinks;
  }

  // If nothing to update, still return success
  if (Object.keys(updateData).length === 0) {
    return new Response(
      JSON.stringify(
        apiSuccessResponse({
          id: artistProfile.id,
          stageName: artistProfile.stageName,
          bio: artistProfile.bio,
          avatarUrl: artistProfile.avatarUrl,
          headerImageUrl: artistProfile.headerImageUrl,
          socialLinks: artistProfile.socialLinks,
          isVerified: artistProfile.isVerified,
        }),
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 7. Update the artist profile
  try {
    const updated = await prisma.artistProfile.update({
      where: { id: artistProfile.id },
      data: updateData,
    });

    return new Response(
      JSON.stringify(
        apiSuccessResponse({
          id: updated.id,
          stageName: updated.stageName,
          bio: updated.bio,
          avatarUrl: updated.avatarUrl,
          headerImageUrl: updated.headerImageUrl,
          socialLinks: updated.socialLinks,
          isVerified: updated.isVerified,
        }),
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          ERROR_CODES.INTERNAL_ERROR,
          "Failed to update artist profile.",
        ),
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract the session token from the cookie header.
 */
function extractSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf("=");
        if (idx === -1) return [c, ""];
        return [c.slice(0, idx), c.slice(idx + 1)];
      }),
  );

  return cookies[SESSION_COOKIE_NAME] ?? null;
}

/* ------------------------------------------------------------------ */
/*  STORY-profile-003: POST /avatar and /header                        */
/* ------------------------------------------------------------------ */

/**
 * Shared handler for POST /avatar and POST /header.
 * Uses parseMultipartImage middleware for file validation.
 */
async function handleImageUpload(
  request: NextRequest,
  uploadType: "avatar" | "header",
) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = extractSessionToken(cookieHeader);

  if (!sessionToken) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "USER_NOT_FOUND",
          "Unauthenticated. A valid session is required.",
        ),
      ),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let verified: { userId: string; role: string };
  try {
    verified = verifyToken(sessionToken);
  } catch {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "USER_NOT_FOUND",
          "Session token is invalid or has expired.",
        ),
      ),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (verified.role !== "ARTIST") {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "FORBIDDEN_INSUFFICIENT_ROLE",
          "ARTIST role is required to upload profile images.",
        ),
      ),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // Use multipart middleware — handles parsing, size (5MB), and MIME validation.
  // On validation failure, returns 422 response with INVALID_AVATAR_URL / INVALID_HEADER_URL.
  const fileData = await parseMultipartImage(request, uploadType);
  if (fileData instanceof Response) {
    return fileData;
  }

  const { buffer, mimeType } = fileData;

  try {
    const result = await uploadProfileImage(
      buffer,
      mimeType,
      uploadType,
      verified.userId,
      prisma.artistProfile,
      storageProvider,
    );

    return new Response(
      JSON.stringify(apiSuccessResponse(result)),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const typedErr = err as Record<string, unknown>;
      return new Response(
        JSON.stringify(apiErrorResponse(String(typedErr.code), String(typedErr.message ?? ""))),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(
        apiErrorResponse(
          "INTERNAL_ERROR",
          "Failed to upload profile image.",
        ),
      ),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.endsWith("/avatar")) {
    return handleImageUpload(request, "avatar");
  }

  if (pathname.endsWith("/header")) {
    return handleImageUpload(request, "header");
  }

  return new Response(
    JSON.stringify(apiErrorResponse("NOT_FOUND", "Endpoint not found.")),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}

/* ------------------------------------------------------------------ */
/*  Storage provider singleton                                         */
/* ------------------------------------------------------------------ */

import { S3StorageService, type StorageConfig } from "@/lib/storage/storage.service";

const storageConfig: StorageConfig = {
  bucket: process.env.S3_BUCKET ?? "indie-music-assets",
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT ?? "https://s3.amazonaws.com",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
};

const storageProvider = new S3StorageService(storageConfig);

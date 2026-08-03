/**
 * STORY-profile-001: GET /api/v1/artists/[artistId]
 *
 * Returns public artist profile with aggregated metrics.
 * Accessible to unauthenticated guests (DEC-005).
 */

import { getArtistPublicProfile } from "@/services/artistProfile";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artistId: string }> },
): Promise<Response> {
  const { artistId } = await params;

  if (!artistId) {
    return new Response(
      JSON.stringify(apiErrorResponse("BAD_REQUEST", "Artist ID is required.")),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Extract session (may be null for guests per DEC-005)
  const cookie = request.headers.get("cookie") ?? "";
  const session = verifySession(cookie);

  // Fetch the profile
  const result = await getArtistPublicProfile(prisma, artistId, session);

  if (!result.success) {
    return new Response(
      JSON.stringify(
        apiErrorResponse(
          result.code ?? "INTERNAL_ERROR",
          result.message ?? "An error occurred.",
        ),
      ),
      { status: result.status, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify(apiSuccessResponse(result.data)),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * STORY-profile-004: GET /api/v1/users/:userId
 *
 * Returns public listener profile with:
 * - Basic user metadata: username, avatarUrl, registration year
 * - Public playlists grid (isPublic=true)
 * - Followed artists list
 *
 * Accessible to unauthenticated guests (DEC-005).
 */

import { getListenerPublicProfile } from "@/services/listenerProfile";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await params;

  if (!userId) {
    return new Response(
      JSON.stringify(apiErrorResponse("BAD_REQUEST", "User ID is required.")),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Extract session (may be null for guests per DEC-005)
  const cookie = request.headers.get("cookie") ?? "";
  const session = verifySession(cookie);

  // Fetch the public profile
  const result = await getListenerPublicProfile(prisma, userId, session);

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

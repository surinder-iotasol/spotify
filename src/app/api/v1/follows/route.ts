/**
 * STORY-profile-006: POST/DELETE /api/v1/follows
 *
 * Handles follow/unfollow actions for authenticated users.
 *
 * POST: Toggle follow on (create Follow record, increment followerCount)
 * DELETE: Toggle follow off (delete Follow record, decrement followerCount)
 *
 * Guest (unauthenticated) requests return HTTP 401 UNAUTHENTICATED.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import { verifySession } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Route handler — POST /api/v1/follows                              */
/* ------------------------------------------------------------------ */

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  // Authenticate the user
  const cookie = request.headers.get("cookie") ?? "";
  const session = verifySession(cookie);

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "Authentication required to follow artists."),
      { status: 401 },
    );
  }

  const { artistProfileId }: { artistProfileId: string } = await request.json();

  if (!artistProfileId) {
    return NextResponse.json(
      apiErrorResponse("BAD_REQUEST", "artistProfileId is required."),
      { status: 400 },
    );
  }

  try {
    // Use upsert to toggle follow (idempotent per user+artist)
    await prisma.follow.upsert({
      where: {
        followerId_artistProfileId: {
          followerId: session.userId,
          artistProfileId,
        },
      },
      create: {
        followerId: session.userId,
        artistProfileId,
      },
      update: {}, // No-op: follow already exists (idempotent toggle)
    });

    // Increment follower count
    await prisma.artistProfile.update({
      where: { id: artistProfileId },
      data: { followerCount: { increment: 1 } },
    });

    return NextResponse.json(
      apiSuccessResponse({ following: true }),
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      apiErrorResponse("INTERNAL_ERROR", "Failed to follow artist."),
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Route handler — DELETE /api/v1/follows                            */
/* ------------------------------------------------------------------ */

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse> {
  // Authenticate the user
  const cookie = request.headers.get("cookie") ?? "";
  const session = verifySession(cookie);

  if (!session || !session.userId) {
    return NextResponse.json(
      apiErrorResponse("UNAUTHENTICATED", "Authentication required to unfollow artists."),
      { status: 401 },
    );
  }

  const { artistProfileId }: { artistProfileId: string } = await request.json();

  if (!artistProfileId) {
    return NextResponse.json(
      apiErrorResponse("BAD_REQUEST", "artistProfileId is required."),
      { status: 400 },
    );
  }

  try {
    // Delete the follow record
    await prisma.follow.deleteMany({
      where: {
        followerId: session.userId,
        artistProfileId,
      },
    });

    // Decrement follower count (guarded: only decrement if count > 0)
    await prisma.artistProfile.updateMany({
      where: {
        id: artistProfileId,
        followerCount: { gt: 0 },
      },
      data: { followerCount: { decrement: 1 } },
    });

    return NextResponse.json(
      apiSuccessResponse({ following: false }),
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      apiErrorResponse("INTERNAL_ERROR", "Failed to unfollow artist."),
      { status: 500 },
    );
  }
}

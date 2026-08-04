/**
 * STORY-profile-006: GET /api/v1/artists/[artistId]/tracks
 *
 * Returns a paginated list of published (LIVE) tracks for an artist's
 * discography view. Supports sorting by Release Date (default) or Title.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccessResponse, apiErrorResponse } from "@/lib/api/response";
import {
  parsePaginationParams,
  apiPaginatedResponse,
} from "@/lib/api/pagination";

/* ------------------------------------------------------------------ */
/*  Route handler — GET /api/v1/artists/:artistId/tracks                */
/* ------------------------------------------------------------------ */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> },
): Promise<NextResponse> {
  const { artistId } = await params;

  if (!artistId) {
    return NextResponse.json(
      apiErrorResponse("BAD_REQUEST", "Artist ID is required."),
      { status: 400 },
    );
  }

  // Parse pagination + sort params from URL
  const pagination = parsePaginationParams(request.url);
  const sortBy = request.nextUrl.searchParams.get("sortBy") ?? "createdAt";
  const sortOrder = (request.nextUrl.searchParams.get("sortOrder") ??
    "desc") as "asc" | "desc";

  // Validate sort field
  const allowedSortFields = ["createdAt", "title", "playCount", "likeCount"];
  if (!allowedSortFields.includes(sortBy)) {
    return NextResponse.json(
      apiErrorResponse(
        "INVALID_PARAMETER",
        `Sort field must be one of: ${allowedSortFields.join(", ")}`,
      ),
      { status: 400 },
    );
  }

  // Validate sort order
  if (sortOrder !== "asc" && sortOrder !== "desc") {
    return NextResponse.json(
      apiErrorResponse(
        "INVALID_PARAMETER",
        "Sort order must be 'asc' or 'desc'",
      ),
      { status: 400 },
    );
  }

  try {
    // Fetch total count of LIVE tracks for this artist
    const total = await prisma.track.count({
      where: {
        artistProfileId: artistId,
        status: "LIVE",
      },
    });

    // Fetch paginated, sorted tracks
    const tracks = await prisma.track.findMany({
      where: {
        artistProfileId: artistId,
        status: "LIVE",
      },
      skip: pagination.offset,
      take: pagination.limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
      select: {
        id: true,
        title: true,
        genre: true,
        playCount: true,
        likeCount: true,
        status: true,
        coverImageUrl: true,
        duration: true,
        createdAt: true,
      },
    });

    // Map to response shape
    const mappedTracks = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      genre: track.genre,
      playCount: track.playCount,
      likeCount: track.likeCount,
      status: track.status,
      coverImageUrl: track.coverImageUrl,
      duration: track.duration,
      createdAt: track.createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    const paginatedResponse = apiPaginatedResponse(mappedTracks, total, pagination.page, pagination.limit);

    return NextResponse.json(
      apiSuccessResponse(paginatedResponse),
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      apiErrorResponse("INTERNAL_ERROR", "Failed to fetch tracks."),
      { status: 500 },
    );
  }
}

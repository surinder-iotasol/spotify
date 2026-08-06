/**
 * STORY-profile-006: DiscographyView Client Component
 *
 * Handles the discography section with:
 * - Release Date (default) and Title sort controls
 * - Infinite scroll loading via IntersectionObserver
 * - Calls GET /api/v1/artists/[artistId]/tracks with sort + pagination
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface DiscographyTrack {
  id: string;
  title: string;
  genre: string;
  playCount: number;
  likeCount: number;
  status: string;
  coverImageUrl: string | null;
  duration: number;
  createdAt: string;
}

interface DiscographyViewProps {
  artistId: string;
}

/**
 * Format a number using compact notation with truncation (e.g. 1.2K, 1.5M).
 */
function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) {
    const truncated = Math.floor((n / 1_000_000) * 10) / 10;
    return `${truncated.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const truncated = Math.floor((n / 1_000) * 10) / 10;
    return `${truncated.toFixed(1)}K`;
  }
  return `${n}`;
}

/**
 * Format duration in seconds to mm:ss.
 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DiscographyView({ artistId }: DiscographyViewProps) {
  const [tracks, setTracks] = useState<DiscographyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"createdAt" | "title">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);

  const fetchTracks = useCallback(
    async (pageNum: number, currentSortBy: string, currentSortOrder: string) => {
      if (!hasMore && pageNum > 1) return;

      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "20",
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
      });

      try {
        const res = await fetch(
          `/api/v1/artists/${artistId}/tracks?${params}`,
        );
        if (!res.ok) {
          if (pageNum === 1) {
            setError("Failed to load discography");
          }
          return;
        }
        const json = await res.json();
        if (!json.success) {
          if (pageNum === 1) setError("Failed to load discography");
          return;
        }

        const fetchedTracks = json.data.tracks as DiscographyTrack[];
        const total = json.data.pagination.total;
        const limit = json.data.pagination.limit;

        if (pageNum === 1) {
          setTracks(fetchedTracks);
        } else {
          setTracks((prev) => [...prev, ...fetchedTracks]);
        }

        setPage(pageNum + 1);
        setHasMore(total > pageNum * limit);
      } catch {
        if (pageNum === 1) setError("Network error loading discography");
      } finally {
        if (pageNum === 1) setLoading(false);
      }
    },
    [artistId, hasMore],
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    setError(null);
    setTracks([]);
    setPage(2);
    setHasMore(true);
    fetchTracks(1, sortBy, sortOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchTracks(page, sortBy, sortOrder);
        }
      },
      { threshold: 0.5 },
    );

    const el = observerTarget.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasMore, loading, fetchTracks, page, sortBy, sortOrder]);

  const handleSort = (field: "createdAt" | "title") => {
    setSortBy(field);
    setSortOrder(field === sortBy ? (sortOrder === "desc" ? "asc" : "desc") : "desc");
  };

  if (error) {
    return (
      <div data-testid="discography-error" className="text-center text-muted-foreground py-8">
        {error}
      </div>
    );
  }

  return (
    <div data-testid="discography-section">
      {/* Sort Controls */}
      <div className="flex gap-2 mb-4" data-testid="discography-sort-controls">
        <button
          data-testid="sort-release-date"
          className={`rounded border border-border px-3 py-1.5 text-sm transition-colors ${
            sortBy === "createdAt"
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-card text-foreground hover:bg-muted"
          }`}
          onClick={() => handleSort("createdAt")}
        >
          Release Date {sortBy === "createdAt" && (sortOrder === "desc" ? "↓" : "↑")}
        </button>
        <button
          data-testid="sort-title"
          className={`rounded border border-border px-3 py-1.5 text-sm transition-colors ${
            sortBy === "title"
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-card text-foreground hover:bg-muted"
          }`}
          onClick={() => handleSort("title")}
        >
          Title {sortBy === "title" && (sortOrder === "desc" ? "↓" : "↑")}
        </button>
      </div>

      {/* Track List */}
      {loading && tracks.length === 0 ? (
        <p className="text-center text-muted-foreground py-8" data-testid="discography-loading">
          Loading discography...
        </p>
      ) : tracks.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No tracks available.
        </p>
      ) : (
        <div data-testid="discography-track-list" className="space-y-2">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              data-testid={`discography-track-${track.id}`}
            >
              <button
                data-testid="play-button"
                aria-label={`Play ${track.title}`}
                className="rounded-full bg-purple-600 p-2 text-white hover:bg-purple-500 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{track.title}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{track.genre}</span>
                  <span>{formatDuration(track.duration)}</span>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{formatCompactNumber(track.playCount)} plays</div>
                <div>{formatCompactNumber(track.likeCount)} likes</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* IntersectionObserver target for infinite scroll */}
      <div ref={observerTarget} data-testid="discography-scroll-target" className="h-1" />

      {hasMore && tracks.length > 0 && (
        <p className="text-center text-muted-foreground py-4" data-testid="discography-more-loading">
          Loading more...
        </p>
      )}
    </div>
  );
}

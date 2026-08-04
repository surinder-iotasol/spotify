/**
 * STORY-profile-008: ListenerProfileView Component
 *
 * Client-compatible component that renders the listener profile UI:
 * - Header with avatar, username, registration year (via ProfileHeader)
 * - Public playlists grid
 * - Followed artists carousel with scroll indicators and keyboard navigation
 */

import { useRef, useEffect, type KeyboardEvent } from "react";
import { ProfileHeader } from "@/components/ProfileHeader";

type PublicPlaylist = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  trackCount: number;
  isPublic: boolean;
  createdAt?: string;
};

type FollowedArtist = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

export type ListenerProfileViewProps = {
  username: string;
  avatarUrl: string | null;
  registrationYear: number;
  publicPlaylists: PublicPlaylist[];
  followedArtists: FollowedArtist[];
};

/**
 * Format a number using compact notation with truncation (e.g. 1.2K, 1.5M).
 * Uses floor to avoid standard rounding surprises.
 */
export function formatCompactNumber(n: number): string {
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
 * PlaylistCard: Displays a single public playlist card with cover mosaic,
 * title, and track count.
 */
export function PlaylistCard({ playlist }: { playlist: PublicPlaylist }) {
  return (
    <a
      href={`/playlists/${playlist.id}`}
      className="group block rounded-lg overflow-hidden border border-border bg-card transition-colors hover:border-purple-500 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500"
      data-testid={`playlist-card-${playlist.id}`}
      aria-label={`Playlist: ${playlist.title} with ${playlist.trackCount} tracks`}
    >
      {/* Cover Art Mosaic */}
      <div
        className="relative w-full aspect-square overflow-hidden"
        data-testid="playlist-cover"
      >
        {playlist.coverImageUrl ? (
          <img
            src={playlist.coverImageUrl}
            alt={`${playlist.title} cover`}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
            <span className="text-4xl font-bold text-white/60">♪</span>
          </div>
        )}
        {/* Track count overlay */}
        <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
          {playlist.trackCount} tracks
        </div>
      </div>
      {/* Playlist title */}
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {playlist.title}
        </h3>
      </div>
    </a>
  );
}

/**
 * FollowedArtistCard: Displays a single followed artist card for the carousel.
 */
export function FollowedArtistCard({ artist }: { artist: FollowedArtist }) {
  return (
    <a
      href={`/artists/${artist.id}`}
      className="flex shrink-0 flex-col items-center gap-2 min-w-[80px]"
      data-testid={`followed-artist-${artist.id}`}
      aria-label={`${artist.displayName}${artist.isVerified ? " (verified)" : ""}`}
    >
      <div className="relative">
        {artist.avatarUrl ? (
          <img
            src={artist.avatarUrl}
            alt={`${artist.displayName} avatar`}
            className="h-16 w-16 rounded-full border-2 border-border object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-purple-700 text-lg font-bold text-white"
            aria-label={`${artist.displayName}'s avatar placeholder`}
          >
            {artist.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {artist.isVerified && (
          <span
            className="absolute -bottom-0.5 -right-0.5 rounded-full bg-purple-600 p-0.5"
            aria-label="Verified artist"
          >
            <svg
              className="h-3 w-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}
      </div>
      <span className="truncate max-w-[80px] text-center text-xs text-muted-foreground">
        {artist.displayName}
      </span>
    </a>
  );
}

/**
 * Scroll the carousel container by a given amount.
 * Uses the CSS scroll-behavior for smooth animation.
 *
 * @param container - The scrollable container element.
 * @param amount - Pixels to scroll (positive = right, negative = left).
 */
export function scrollCarousel(
  container: HTMLDivElement,
  amount: number,
): void {
  container.scrollBy({ left: amount, behavior: "smooth" });
}

/**
 * Main listener profile view component.
 * Can be used in server components (async) or tested in isolation.
 */
export function ListenerProfileView({
  username,
  avatarUrl,
  registrationYear,
  publicPlaylists,
  followedArtists,
}: ListenerProfileViewProps) {
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleScrollLeft = (): void => {
    if (carouselRef.current) {
      scrollCarousel(carouselRef.current, -240);
    }
  };

  const handleScrollRight = (): void => {
    if (carouselRef.current) {
      scrollCarousel(carouselRef.current, 240);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleScrollLeft();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleScrollRight();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Section */}
      <ProfileHeader
        username={username}
        avatarUrl={avatarUrl}
        registrationYear={registrationYear}
      />

      {/* Public Playlists Grid */}
      <section
        className="mx-auto max-w-4xl px-4 pb-8"
        aria-labelledby="public-playlists-heading"
      >
        <h2
          id="public-playlists-heading"
          className="mb-4 text-lg font-semibold text-foreground"
          data-testid="playlists-heading"
        >
          Public Playlists ({publicPlaylists.length})
        </h2>

        {publicPlaylists.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-12 text-center"
            data-testid="empty-playlists"
          >
            <span className="text-4xl mb-2">♪</span>
            <p className="text-muted-foreground">No public playlists yet.</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
            data-testid="playlists-grid"
          >
            {publicPlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
      </section>

      {/* Followed Artists Carousel */}
      <section
        className="mx-auto max-w-4xl px-4 pb-12"
        aria-labelledby="followed-artists-heading"
      >
        <h2
          id="followed-artists-heading"
          className="mb-4 text-lg font-semibold text-foreground"
          data-testid="followed-artists-heading"
        >
          Followed Artists ({followedArtists.length})
        </h2>

        {followedArtists.length === 0 ? (
          <p className="text-muted-foreground">No followed artists yet.</p>
        ) : (
          <div className="relative">
            {/* Scroll Left Button */}
            <button
              type="button"
              onClick={handleScrollLeft}
              aria-label="Scroll left"
              className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow-md ring-1 ring-border hover:bg-background focus-visible:ring-2 focus-visible:ring-purple-500"
              data-testid="carousel-scroll-left"
            >
              <svg
                className="h-5 w-5 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            {/* Scrollable Container */}
            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
              data-testid="followed-artists-carousel"
              role="list"
              aria-label="Followed artists"
              onKeyDown={handleKeyDown}
              tabIndex={0}
              style={{ scrollbarWidth: "thin" }}
            >
              {followedArtists.map((artist) => (
                <FollowedArtistCard key={artist.id} artist={artist} />
              ))}
            </div>

            {/* Scroll Right Button */}
            <button
              type="button"
              onClick={handleScrollRight}
              aria-label="Scroll right"
              className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow-md ring-1 ring-border hover:bg-background focus-visible:ring-2 focus-visible:ring-purple-500"
              data-testid="carousel-scroll-right"
            >
              <svg
                className="h-5 w-5 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * STORY-profile-008: Public Listener Profile Page
 *
 * Server component that fetches listener profile data and renders the
 * public-facing listener profile view with header section (avatar, username,
 * registration year), public playlists grid, and followed artists carousel.
 */

import { notFound } from "next/navigation";

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

type ListenerProfileData = {
  id: string;
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
 * Fetch listener profile data from the API.
 */
async function fetchListenerProfile(userId: string): Promise<ListenerProfileData | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000"}/api/v1/users/${userId}`,
    {
      next: { revalidate: 60 },
      cache: "force-cache",
    },
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    return null;
  }

  const json = await res.json();
  if (!json.success) return null;
  return json.data as ListenerProfileData;
}

/**
 * PlaylistCard: Displays a single public playlist card with cover mosaic,
 * title, and track count.
 */
function PlaylistCard({ playlist }: { playlist: PublicPlaylist }) {
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
function FollowedArtistCard({ artist }: { artist: FollowedArtist }) {
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

export default async function ListenerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const data = await fetchListenerProfile(userId);

  if (!data) {
    notFound();
  }

  const { username, avatarUrl, registrationYear, publicPlaylists, followedArtists } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Section */}
      <div className="mx-auto max-w-4xl px-4 pt-8 pb-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          {/* Avatar */}
          <div className="shrink-0">
            {avatarUrl ? (
              <img
                data-testid="listener-avatar"
                src={avatarUrl}
                alt={`${username} avatar`}
                className="h-24 w-24 rounded-full border-4 border-background object-cover sm:h-32 sm:w-32"
              />
            ) : (
              <div
                data-testid="listener-avatar"
                className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-background bg-purple-700 text-2xl font-bold text-white sm:h-32 sm:w-32"
                aria-label={`${username}'s avatar placeholder`}
              >
                {username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Username and Registration Year */}
          <div className="text-center sm:text-left">
            <h1
              className="text-2xl font-bold sm:text-3xl"
              data-testid="username"
            >
              {username}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Member since {registrationYear}
            </p>
          </div>
        </div>
      </div>

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
          <div
            className="flex gap-4 overflow-x-auto pb-2"
            data-testid="followed-artists-carousel"
            role="list"
            aria-label="Followed artists"
          >
            {followedArtists.map((artist) => (
              <FollowedArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Export formatCompactNumber for testing
export { formatCompactNumber };

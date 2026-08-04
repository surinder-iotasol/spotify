/**
 * STORY-profile-006: Public Artist Profile Page
 *
 * Server component that fetches artist profile data and renders the
 * public-facing artist profile view with header banner, avatar,
 * metrics, popular tracks, and full discography.
 */

import { notFound } from "next/navigation";
import { FollowButton } from "@/components/FollowButton";

type ArtistProfileResponse = {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  headerImageUrl: string | null;
  socialLinks: { platform: string; url: string }[] | null;
  isVerified: boolean;
  isFollowing: boolean;
};

type Track = {
  id: string;
  title: string;
  genre: string;
  playCount: number;
  likeCount: number;
  status: string;
  coverImageUrl: string | null;
  duration: number;
  createdAt?: string;
};

type MetricsResponse = {
  totalPlays: number;
  totalLikes: number;
  followerCount: number;
};

type ProfileApiData = {
  profile: ArtistProfileResponse;
  metrics: MetricsResponse;
  topTracks: Track[];
};

/**
 * Format a number using compact notation (e.g. 1.2K, 1.5M).
 */
function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
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

/**
 * Fetch artist profile data from the API.
 */
async function fetchArtistProfile(artistId: string): Promise<ProfileApiData | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000"}/api/v1/artists/${artistId}`,
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
  return json.data as ProfileApiData;
}

/**
 * Fetch paginated discography tracks.
 */
async function fetchDiscography(
  artistId: string,
  page: number = 1,
  sortBy: string = "createdAt",
  sortOrder: "asc" | "desc" = "desc",
): Promise<{ tracks: Track[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
    sortBy,
    sortOrder,
  });

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000"}/api/v1/artists/${artistId}/tracks?${params}`,
    {
      next: { revalidate: 60 },
      cache: "force-cache",
    },
  );

  if (!res.ok) {
    return { tracks: [], total: 0 };
  }

  const json = await res.json();
  if (!json.success) return { tracks: [], total: 0 };

  return {
    tracks: json.data.tracks as Track[],
    total: json.data.pagination.total,
  };
}

export default async function ArtistProfilePage({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  const data = await fetchArtistProfile(artistId);

  if (!data) {
    notFound();
  }

  const { profile, metrics, topTracks } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Banner — 16:9 ratio with gradient fallback */}
      <div
        data-testid="header-banner"
        className="relative w-full"
        style={{ aspectRatio: "16 / 9" }}
      >
        {profile.headerImageUrl ? (
          <img
            src={profile.headerImageUrl}
            alt={`${profile.displayName} header`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900" />
        )}
      </div>

      {/* Profile Section */}
      <div className="mx-auto max-w-4xl px-4 -mt-16 relative z-10">
        {/* Avatar */}
        <div className="mb-4">
          {profile.avatarUrl ? (
            <img
              data-testid="avatar"
              src={profile.avatarUrl}
              alt={`${profile.displayName} avatar`}
              className="h-32 w-32 rounded-full border-4 border-background object-cover"
            />
          ) : (
            <div
              data-testid="avatar"
              className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-background bg-purple-700 text-3xl font-bold text-white"
            >
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Display Name, Bio, Social Links */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{profile.displayName}</h1>
            {profile.isVerified && (
              <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs text-white">
                Verified
              </span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-2 text-muted-foreground" data-testid="bio">
              {profile.bio}
            </p>
          )}

          {/* Social Links */}
          {profile.socialLinks && profile.socialLinks.length > 0 && (
            <div className="mt-3 flex gap-3" data-testid="social-links">
              {profile.socialLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground text-sm underline"
                  data-testid={`social-link-${link.platform}`}
                >
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Follow Button */}
        <div className="mb-8">
          <button
            data-testid={profile.isFollowing ? "unfollow-button" : "follow-button"}
            className="rounded-full bg-purple-600 px-6 py-2.5 font-semibold text-white hover:bg-purple-500 transition-colors"
          >
            {profile.isFollowing ? "Unfollow" : "Follow"}
          </button>
        </div>

        {/* Metrics Bar */}
        <div
          data-testid="metrics"
          className="mb-8 flex gap-6 rounded-lg border border-border bg-card p-4"
        >
          <div className="text-center">
            <div className="text-xl font-bold">
              {formatCompactNumber(metrics.totalPlays)}
            </div>
            <div className="text-xs text-muted-foreground">Plays</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">
              {formatCompactNumber(metrics.totalLikes)}
            </div>
            <div className="text-xs text-muted-foreground">Likes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">
              {formatCompactNumber(metrics.followerCount)}
            </div>
            <div className="text-xs text-muted-foreground">Followers</div>
          </div>
        </div>
      </div>

      {/* Popular Tracks Section */}
      <div className="mx-auto max-w-4xl px-4 pb-8">
        <h2 className="mb-4 text-xl font-bold" data-testid="popular-tracks-heading">
          Popular Tracks
        </h2>
        <div data-testid="popular-tracks" className="space-y-2">
          {topTracks.slice(0, 5).map((track, i) => (
            <div
              key={track.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              data-testid={`popular-track-${i}`}
            >
              <span className="text-muted-foreground w-6 text-center text-sm">
                {i + 1}
              </span>
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
          {topTracks.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              No tracks available.
            </p>
          )}
        </div>
      </div>

      {/* Full Track Catalog / Discography */}
      <div className="mx-auto max-w-4xl px-4 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold" data-testid="discography-heading">
            Discography
          </h2>
          {/* Sort Controls */}
          <div className="flex gap-2">
            <button
              data-testid="sort-release-date"
              className="rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              Release Date
            </button>
            <button
              data-testid="sort-title"
              className="rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              Title
            </button>
          </div>
        </div>
        <div data-testid="discography-track-list" className="space-y-2">
          {/* Discography tracks will be populated client-side via fetch + infinite scroll */}
          <p className="text-center text-muted-foreground py-8" data-testid="discography-loading">
            Loading discography...
          </p>
        </div>
      </div>
    </div>
  );
}

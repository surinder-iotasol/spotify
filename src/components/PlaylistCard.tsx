/**
 * STORY-profile-008c: PlaylistCard component
 *
 * Displays a single public playlist card with:
 * - Cover mosaic image (or fallback placeholder)
 * - Playlist title
 * - Track count overlay
 * - Clickable link to playlist detail page
 */

type PlaylistCardProps = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  trackCount: number;
};

export function PlaylistCard({
  id,
  title,
  coverImageUrl,
  trackCount,
}: PlaylistCardProps) {
  return (
    <a
      href={`/playlists/${id}`}
      className="group block rounded-lg overflow-hidden border border-border bg-card transition-colors hover:border-purple-500 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500"
      data-testid={`playlist-card-${id}`}
      aria-label={`Playlist: ${title} with ${trackCount} tracks`}
    >
      {/* Cover Art */}
      <div
        className="relative w-full aspect-square overflow-hidden"
        data-testid="playlist-cover"
      >
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={`${title} cover`}
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
          {trackCount} tracks
        </div>
      </div>
      {/* Playlist title */}
      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>
    </a>
  );
}

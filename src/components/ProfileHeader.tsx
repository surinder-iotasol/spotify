/**
 * STORY-profile-008b: ProfileHeader Component
 *
 * Displays user avatar (or placeholder), username, and registration year.
 * Reuses the profile image upload service for avatar rendering.
 * Falls back to a default placeholder when no image is available.
 * Passes WCAG 2.1 AA with alt text on the avatar image.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ProfileHeaderProps {
  username: string;
  avatarUrl: string | null;
  registrationYear: number;
  /** Optional CSS class applied to the outer wrapper */
  className?: string;
}

/**
 * ProfileHeader: Renders user avatar (or placeholder), username, and registration year.
 *
 * WCAG 2.1 AA compliance:
 * - Avatar img has descriptive alt text when image present
 * - Avatar placeholder has aria-label with the username
 * - Username uses heading level 1
 */
export function ProfileHeader({
  username,
  avatarUrl,
  registrationYear,
  className,
}: ProfileHeaderProps) {
  const hasAvatar = Boolean(avatarUrl);
  const initial = username.length > 0 ? username.charAt(0) : "?";

  return (
    <div
      className={`mx-auto max-w-4xl px-4 pt-8 pb-6 ${className ?? ""}`}
      data-testid="profile-header"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        {/* Avatar */}
        <div className="shrink-0">
          {hasAvatar ? (
            <img
              data-testid="profile-avatar"
              src={avatarUrl ?? undefined}
              alt={`${username}'s avatar`}
              className="h-24 w-24 rounded-full border-4 border-background object-cover sm:h-32 sm:w-32"
            />
          ) : (
            <div
              data-testid="profile-avatar"
              className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-background bg-purple-700 text-2xl font-bold text-white sm:h-32 sm:w-32"
              aria-label={`${username}'s avatar placeholder`}
            >
              {initial.toUpperCase()}
            </div>
          )}
        </div>

        {/* Username and Registration Year */}
        <div className="text-center sm:text-left">
          <h1
            className="text-2xl font-bold sm:text-3xl"
            data-testid="profile-username"
          >
            {username}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Member since {registrationYear}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProfileHeader;

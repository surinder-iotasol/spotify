/**
 * STORY-role-005: Artist Upgrade Form component.
 *
 * Features:
 * - stageName field (1-50 chars) with client-side validation
 * - bio textarea (max 500 chars) with character counter
 * - genreTags multi-select (1-5 genre tags)
 * - WCAG 2.1 AA accessible: aria-invalid, aria-describedby, role="alert", focus management,
 *   visible focus highlights (outline-ring)
 * - Server error alert banner on validation or API failure
 * - On success, shows artist dashboard link (browser auto-handles Set-Cookie)
 * - Loading state with aria-disabled on submit button
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Genre options derived from the Prisma Genre enum. */
const GENRE_OPTIONS: { value: string; label: string }[] = [
  { value: 'INDIE_ROCK', label: 'Indie Rock' },
  { value: 'BEDROOM_POP', label: 'Bedroom Pop' },
  { value: 'ELECTRONIC', label: 'Electronic' },
  { value: 'HIP_HOP', label: 'Hip Hop' },
  { value: 'LO_FI', label: 'Lo-Fi' },
  { value: 'AMBIENT', label: 'Ambient' },
  { value: 'R_AND_B', label: 'R&B' },
  { value: 'FOLK', label: 'Folk' },
  { value: 'OTHER', label: 'Other' },
];

const MAX_STAGE_NAME = 50;
const MAX_BIO_LENGTH = 500;
const MIN_GENRE_TAGS = 1;
const MAX_GENRE_TAGS = 5;

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validateStageName(value: string): string | null {
  if (!value || !value.trim()) {
    return 'Stage name is required';
  }
  if (value.trim().length < 1 || value.trim().length > MAX_STAGE_NAME) {
    return `Stage name must be between 1 and ${MAX_STAGE_NAME} characters`;
  }
  return null;
}

function validateBio(value: string): string | null {
  if (value.length > MAX_BIO_LENGTH) {
    return `Bio must be ${MAX_BIO_LENGTH} characters or fewer`;
  }
  return null;
}

function validateGenreTags(selected: string[]): string | null {
  if (selected.length < MIN_GENRE_TAGS) {
    return `Select at least ${MIN_GENRE_TAGS} genre tag${MIN_GENRE_TAGS > 1 ? 's' : ''}`;
  }
  if (selected.length > MAX_GENRE_TAGS) {
    return `Select at most ${MAX_GENRE_TAGS} genre tag${MAX_GENRE_TAGS > 1 ? 's' : ''}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Form error types                                                   */
/* ------------------------------------------------------------------ */

interface FormErrors {
  stageName: string | null;
  bio: string | null;
  genreTags: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component props                                                   */
/* ------------------------------------------------------------------ */

interface ArtistUpgradeFormProps {
  /** Called after successful upgrade with the new user data. */
  onSuccess?: (data: Record<string, unknown>) => void;
  /** Optional custom class. */
  className?: string;
}

/**
 * Artist upgrade form component with client-side validation,
 * accessible error handling, and genre tag selection.
 */
export function ArtistUpgradeForm({ onSuccess, className }: ArtistUpgradeFormProps) {
  const [stageName, setStageName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [selectedGenres, setSelectedGenres] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<FormErrors>({
    stageName: null,
    bio: null,
    genreTags: null,
  });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const stageNameRef = React.useRef<HTMLInputElement>(null);
  const genreSelectRef = React.useRef<HTMLSelectElement>(null);

  /* -- Client-side validation -- */

  function validateAll(): boolean {
    const newErrors: FormErrors = {
      stageName: validateStageName(stageName),
      bio: validateBio(bio),
      genreTags: validateGenreTags(selectedGenres),
    };
    setErrors(newErrors);

    // Focus first invalid field (WCAG 2.1 AA)
    if (newErrors.stageName) {
      stageNameRef.current?.focus();
    } else if (newErrors.genreTags) {
      genreSelectRef.current?.focus();
    }

    return !newErrors.stageName && !newErrors.bio && !newErrors.genreTags;
  }

  /* -- Single-field blur validation -- */

  function handleStageNameBlur() {
    setErrors((prev) => ({ ...prev, stageName: validateStageName(stageName) }));
  }

  function handleBioBlur() {
    setErrors((prev) => ({ ...prev, bio: validateBio(bio) }));
  }

  /* -- Submit handler -- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSuccess(false);

    if (!validateAll()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/v1/users/me/upgrade-to-artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageName: stageName.trim(),
          bio,
          genreTags: selectedGenres,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        const errorObj =
          errorBody &&
          typeof errorBody === 'object' &&
          'error' in errorBody
            ? (errorBody as { error?: { message?: string; code?: string } })
            : null;
        const message =
          errorObj?.error?.message ||
          (typeof errorBody === 'string'
            ? errorBody
            : 'Upgrade failed. Please try again.');
        setServerError(message);
        return;
      }

      const data = await res.json();
      // The browser automatically handles the Set-Cookie header for session refresh.
      setSuccess(true);
      onSuccess?.(data);
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  /* -- Submit button label -- */

  const submitLabel = loading ? 'Upgrading...' : 'Upgrade to Artist';

  /* -- Render -- */

  if (success) {
    return (
      <div
        className={cn(
          'flex flex-col gap-5 w-full max-w-md mx-auto p-4',
          className,
        )}
      >
        <div
          role="alert"
          aria-live="assertive"
          data-testid="upgrade-success-banner"
          className="rounded-md bg-green-600/15 p-3 text-sm text-green-600 border border-green-600/30"
        >
          <h2 className="font-semibold text-base">Welcome, Artist!</h2>
          <p className="mt-1">
            Your account has been upgraded. You can now manage your artist
            profile and upload music.
          </p>
          <a
            href="/artist/dashboard"
            className="mt-2 inline-block text-sm underline underline-offset-2 hover:no-underline"
          >
            Go to Artist Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn('flex flex-col gap-5 w-full max-w-md mx-auto p-4', className)}
    >
      {/* Server error alert banner — accessible */}
      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="upgrade-error-banner"
          className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30"
        >
          {serverError}
        </div>
      )}

      {/* Stage name field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="artist-stage-name"
          className="text-sm font-medium text-foreground"
        >
          Stage Name
        </label>
        <Input
          id="artist-stage-name"
          name="stageName"
          type="text"
          placeholder="Your stage name"
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
          onBlur={handleStageNameBlur}
          ref={stageNameRef}
          aria-invalid={!!errors.stageName}
          aria-describedby={errors.stageName ? 'artist-stage-name-error' : undefined}
          className={cn(errors.stageName && 'border-destructive')}
        />
        {errors.stageName && (
          <p
            id="artist-stage-name-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.stageName}
          </p>
        )}
      </div>

      {/* Bio textarea */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="artist-bio"
          className="text-sm font-medium text-foreground"
        >
          Bio
        </label>
        <textarea
          id="artist-bio"
          name="bio"
          placeholder="Tell your story..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={handleBioBlur}
          aria-invalid={!!errors.bio}
          aria-describedby={errors.bio ? 'artist-bio-error' : 'artist-bio-hint'}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            errors.bio && 'border-destructive',
          )}
          maxLength={MAX_BIO_LENGTH}
        />
        <span
          id="artist-bio-hint"
          className="text-xs text-muted-foreground"
        >
          {bio.length}/{MAX_BIO_LENGTH} characters
        </span>
        {errors.bio && (
          <p
            id="artist-bio-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.bio}
          </p>
        )}
      </div>

      {/* Genre tags multi-select */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="artist-genres"
          className="text-sm font-medium text-foreground"
        >
          Genre Tags ({selectedGenres.length}/{MAX_GENRE_TAGS})
        </label>
        <select
          id="artist-genres"
          name="genreTags"
          multiple
          ref={genreSelectRef}
          value={selectedGenres}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map(
              (opt) => opt.value,
            );
            setSelectedGenres(selected);
            setErrors((prev) => ({ ...prev, genreTags: validateGenreTags(selected) }));
          }}
          aria-invalid={!!errors.genreTags}
          aria-describedby={errors.genreTags ? 'artist-genres-error' : 'artist-genres-hint'}
          className={cn(
            'flex min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            errors.genreTags && 'border-destructive',
          )}
        >
          {GENRE_OPTIONS.map((genre) => (
            <option key={genre.value} value={genre.value}>
              {genre.label}
            </option>
          ))}
        </select>
        <span
          id="artist-genres-hint"
          className="text-xs text-muted-foreground"
        >
          Hold Ctrl/Cmd to select multiple. Choose {MIN_GENRE_TAGS} to {MAX_GENRE_TAGS} genres.
        </span>
        {errors.genreTags && (
          <p
            id="artist-genres-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.genreTags}
          </p>
        )}
      </div>

      {/* Submit button */}
      <Button type="submit" disabled={loading} aria-disabled={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}

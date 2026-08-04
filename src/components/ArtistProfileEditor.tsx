/**
 * STORY-profile-007: Artist Profile Editor Form Component
 *
 * Provides form controls for editing stageName, bio (500-char counter),
 * up to 5 social links with platform selectors, avatar/header image uploaders
 * with crop previews, and inline validation/error handling.
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageUploadPreview, useImageUpload, validateImageFile } from '@/components/ImageUploadPreview';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SocialLink {
  platform: string;
  url: string;
}

const ALLOWED_PLATFORMS = ['twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'website', 'other'];

interface ProfileData {
  stageName: string;
  bio: string;
  socialLinks: SocialLink[];
}

interface FormErrors {
  stageName: string | null;
  bio: string | null;
  socialLinks?: string[] | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function validateStageName(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return 'Stage name is required';
  }
  if (value.trim().length < 1 || value.trim().length > 50) {
    return 'Stage name must be between 1 and 50 characters';
  }
  return null;
}

function validateBio(value: string): string | null {
  if (value.length > 500) {
    return 'Bio must not exceed 500 characters';
  }
  return null;
}

function validateSocialLinks(links: SocialLink[]): string[] {
  const errors: string[] = [];
  if (links.length > 5) {
    errors.push('Social links must not exceed 5 entries');
  }
  links.forEach((link, i) => {
    if (!link.platform.trim()) {
      errors.push(`Social link ${i + 1}: platform is required`);
    }
    if (!link.url.trim()) {
      errors.push(`Social link ${i + 1}: URL is required`);
    } else {
      try {
        const parsed = new URL(link.url);
        if (parsed.protocol !== 'https:') {
          errors.push(`Social link ${i + 1}: URL must use HTTPS`);
        }
      } catch {
        errors.push(`Social link ${i + 1}: must be a valid URL`);
      }
    }
  });
  return errors;
}

function isFormDirty(
  initial: ProfileData,
  current: ProfileData,
): boolean {
  return (
    current.stageName !== initial.stageName ||
    current.bio !== initial.bio ||
    current.socialLinks.length !== initial.socialLinks.length ||
    current.socialLinks.some((link, i) => (
      link.platform !== initial.socialLinks[i]?.platform ||
      link.url !== initial.socialLinks[i]?.url
    ))
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-Component: SocialLinkRow                                       */
/* ------------------------------------------------------------------ */

interface SocialLinkRowProps {
  index: number;
  link: SocialLink;
  onChange: (index: number, field: 'platform' | 'url', value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function SocialLinkRow({ index, link, onChange, onRemove, canRemove }: SocialLinkRowProps) {
  return (
    <div className="flex gap-2 items-start" data-testid={`social-link-${index}`}>
      <select
        value={link.platform}
        onChange={(e) => onChange(index, 'platform', e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm w-28"
        aria-label={`Platform for social link ${index + 1}`}
      >
        <option value="">Platform</option>
        {ALLOWED_PLATFORMS.map((p) => (
          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
        ))}
      </select>
      <Input
        type="url"
        value={link.url}
        onChange={(e) => onChange(index, 'url', e.target.value)}
        placeholder="https://example.com"
        className="flex-1"
        aria-label={`URL for social link ${index + 1}`}
      />
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="text-red-400 hover:text-red-300 px-2"
          aria-label={`Remove social link ${index + 1}`}
        >
          ×
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component: ArtistProfileEditor                                */
/* ------------------------------------------------------------------ */

interface ArtistProfileEditorProps {
  initialData: ProfileData;
  avatarUrl?: string | null;
  headerUrl?: string | null;
  onSaved?: () => void;
}

export function ArtistProfileEditor({
  initialData,
  avatarUrl,
  headerUrl,
  onSaved,
}: ArtistProfileEditorProps) {
  const [stageName, setStageName] = React.useState(initialData.stageName);
  const [bio, setBio] = React.useState(initialData.bio);
  const [socialLinks, setSocialLinks] = React.useState<SocialLink[]>(
    initialData.socialLinks.length > 0 ? initialData.socialLinks : [{ platform: '', url: '' }]
  );
  const [errors, setErrors] = React.useState<FormErrors>({ stageName: null, bio: null });
  const [socialLinkErrors, setSocialLinkErrors] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const { addToast } = useToast();

  // Avatar upload state
  const avatarState = useImageUpload('avatar');
  const [pendingAvatarFile, setPendingAvatarFile] = React.useState<File | null>(null);

  // Header upload state
  const headerState = useImageUpload('header');
  const [pendingHeaderFile, setPendingHeaderFile] = React.useState<File | null>(null);

  // Stage name blur validation
  function handleStageNameBlur() {
    setErrors((prev) => ({
      ...prev,
      stageName: validateStageName(stageName),
    }));
  }

  // Bio blur validation
  function handleBioBlur() {
    setErrors((prev) => ({
      ...prev,
      bio: validateBio(bio),
    }));
  }

  // Social link field update
  function handleSocialLinkChange(index: number, field: 'platform' | 'url', value: string) {
    const updated = [...socialLinks];
    updated[index] = { ...updated[index], [field]: value };
    setSocialLinks(updated);
  }

  // Remove social link
  function handleRemoveSocialLink(index: number) {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  }

  // Add social link
  function handleAddSocialLink() {
    if (socialLinks.length < 5) {
      setSocialLinks((prev) => [...prev, { platform: '', url: '' }]);
    }
  }

  // Avatar file selection
  function handleAvatarFileSelect(file: File) {
    const err = validateImageFile(file);
    if (err) {
      addToast(err, 'error');
      return;
    }
    setPendingAvatarFile(file);
  }

  function handleAvatarClear() {
    setPendingAvatarFile(null);
    avatarState.clearImage();
  }

  // Header file selection
  function handleHeaderFileSelect(file: File) {
    const err = validateImageFile(file);
    if (err) {
      addToast(err, 'error');
      return;
    }
    setPendingHeaderFile(file);
  }

  function handleHeaderClear() {
    setPendingHeaderFile(null);
    headerState.clearImage();
  }

  /* -- Submit handler -- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({ stageName: null, bio: null });
    setSocialLinkErrors([]);

    // Validate stage name
    const stageNameError = validateStageName(stageName);
    if (stageNameError) {
      setErrors((prev) => ({ ...prev, stageName: stageNameError }));
      return;
    }

    // Validate bio
    const bioError = validateBio(bio);
    if (bioError) {
      setErrors((prev) => ({ ...prev, bio: bioError }));
      return;
    }

    // Validate social links
    const linkErrs = validateSocialLinks(socialLinks);
    if (linkErrs.length > 0) {
      setSocialLinkErrors(linkErrs);
      return;
    }

    // Build metadata update
    const hasProfileChanges = isFormDirty(initialData, {
      stageName: stageName.trim(),
      bio: bio.trim(),
      socialLinks: socialLinks.filter((l) => l.platform && l.url),
    });

    setSaving(true);

    try {
      // 1. Upload image files if any
      if (pendingAvatarFile) {
        const formData = new FormData();
        formData.append('image', pendingAvatarFile);
        const avatarRes = await fetch('/api/v1/artist-profile/avatar', {
          method: 'POST',
          body: formData,
        });
        if (!avatarRes.ok) {
          const errData = await avatarRes.json();
          throw new Error(errData.error?.message || 'Failed to upload avatar');
        }
      }

      if (pendingHeaderFile) {
        const formData = new FormData();
        formData.append('image', pendingHeaderFile);
        const headerRes = await fetch('/api/v1/artist-profile/header', {
          method: 'POST',
          body: formData,
        });
        if (!headerRes.ok) {
          const errData = await headerRes.json();
          throw new Error(errData.error?.message || 'Failed to upload header');
        }
      }

      // 2. Update metadata if changed
      if (hasProfileChanges) {
        const res = await fetch('/api/v1/artist-profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: stageName.trim(),
            bio: bio.trim() || '',
            socialLinks: socialLinks.filter((l) => l.platform && l.url).map((l) => ({
              platform: l.platform.trim(),
              url: l.url.trim(),
            })),
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          if (errData.error?.details?.[0]) {
            addToast(errData.error.details[0].message, 'error');
          } else {
            throw new Error(errData.error?.message || 'Failed to update profile');
          }
          return;
        }
      }

      addToast('Profile saved successfully', 'success');
      onSaved?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const bioCharCount = bio.length;
  const bioCharRemaining = 500 - bioCharCount;
  const isBioOverLimit = bioCharCount > 500;

  return (
    <form onSubmit={handleSubmit} className="space-y-8" data-testid="artist-profile-editor">
      {/* Avatar Upload */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Profile Photo</h3>
        <ImageUploadPreview
          type="avatar"
          currentUrl={avatarUrl || (pendingAvatarFile ? undefined : null)}
          onFileSelect={handleAvatarFileSelect}
          onClear={avatarState.file ? handleAvatarClear : undefined}
        />
      </div>

      {/* Header Upload */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Header Banner</h3>
        <ImageUploadPreview
          type="header"
          currentUrl={headerUrl || (pendingHeaderFile ? undefined : null)}
          onFileSelect={handleHeaderFileSelect}
          onClear={headerState.file ? handleHeaderClear : undefined}
        />
      </div>

      {/* Stage Name */}
      <div className="space-y-2">
        <label htmlFor="stageName" className="block text-sm font-medium text-gray-300">
          Stage Name
        </label>
        <Input
          id="stageName"
          type="text"
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
          onBlur={handleStageNameBlur}
          placeholder="Your stage name"
          className={errors.stageName ? 'border-red-500' : ''}
          aria-invalid={!!errors.stageName}
          aria-describedby={errors.stageName ? 'stageName-error' : undefined}
        />
        {errors.stageName && (
          <p id="stageName-error" data-testid="error-stageName" className="text-sm text-red-400" role="alert">
            {errors.stageName}
          </p>
        )}
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <label htmlFor="bio" className="block text-sm font-medium text-gray-300">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={handleBioBlur}
          placeholder="Tell us about yourself..."
          rows={4}
          className={cn(
            'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            isBioOverLimit ? 'border-red-500' : errors.bio ? 'border-red-500' : ''
          )}
          aria-invalid={!!errors.bio || isBioOverLimit}
          aria-describedby="bio-counter"
        />
        <div className="flex justify-between items-center text-xs">
          <span
            data-testid="bio-counter"
            className={cn(
              'transition-colors',
              isBioOverLimit ? 'text-red-400' : bioCharRemaining < 50 ? 'text-yellow-400' : 'text-muted-foreground'
            )}
          >
            {bioCharCount}/500 ({bioCharRemaining} remaining)
          </span>
        </div>
        {errors.bio && (
          <p data-testid="error-bio" className="text-sm text-red-400" role="alert">
            {errors.bio}
          </p>
        )}
      </div>

      {/* Social Links */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Social Links</h3>
        {socialLinkErrors.length > 0 && (
          <div className="space-y-1" role="alert">
            {socialLinkErrors.map((err, i) => (
              <p key={i} data-testid="error-socialLink" className="text-sm text-red-400">
                {err}
              </p>
            ))}
          </div>
        )}
        {socialLinks.map((link, i) => (
          <SocialLinkRow
            key={i}
            index={i}
            link={link}
            onChange={handleSocialLinkChange}
            onRemove={handleRemoveSocialLink}
            canRemove={socialLinks.length > 1}
          />
        ))}
        {socialLinks.length < 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddSocialLink}
            className="text-sm"
          >
            + Add Social Link
          </Button>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={saving} data-testid="save-profile-button">
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </form>
  );
}

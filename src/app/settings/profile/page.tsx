/**
 * STORY-profile-007: Artist Profile Edit Page
 *
 * Renders the ArtistProfileEditor component with mock profile data.
 */
'use client';

import { ToastProvider } from '@/components/ui/toast';
import { ArtistProfileEditor } from '@/components/ArtistProfileEditor';

export default function ProfileEditPage() {
  const initialData = {
    stageName: 'Sample Artist',
    bio: 'Music producer and DJ from Brooklyn.',
    socialLinks: [
      { platform: 'twitter', url: 'https://twitter.com/sampleartist' },
      { platform: 'instagram', url: 'https://instagram.com/sampleartist' },
    ],
  };

  return (
    <ToastProvider>
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Edit Profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Update your artist profile information and images.
          </p>
        </div>
        <ArtistProfileEditor
          initialData={initialData}
          avatarUrl="https://example.com/avatar.jpg"
          headerUrl="https://example.com/header.jpg"
          onSaved={() => {
            // In production, refetch profile data or redirect
          }}
        />
      </div>
    </ToastProvider>
  );
}

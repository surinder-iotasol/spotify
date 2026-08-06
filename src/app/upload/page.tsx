/**
 * STORY-track-006: Track Upload Page
 *
 * Client-side page that verifies artist session and renders the metadata
 * entry form for authenticated artists.
 */
'use client';

import { useState, useEffect } from 'react';
import { MetadataEntryForm, type MetadataFormValues } from '@/components/metadata/MetadataEntryForm';

interface UploadPageState {
  artistId: string;
  loading: boolean;
  error: string | null;
  submitted: boolean;
}

/** Handle form submission for metadata entry. */
function handleSubmitMetadata(artistId: string, data: MetadataFormValues): void {
  console.log('[UploadPage] Metadata submitted for artist:', artistId, data);
  // In a real implementation, POST to /api/v1/tracks/upload-intent here
}

export default function UploadPage() {
  const [state, setState] = useState<UploadPageState>({
    artistId: '',
    loading: true,
    error: null,
    submitted: false,
  });

  useEffect(() => {
    fetch('/api/v1/users/me')
      .then((res) => {
        if (!res.ok && res.status === 401) {
          setState({ artistId: '', loading: false, error: 'Please log in as an artist to upload tracks.', submitted: false });
          return;
        }
        if (!res.ok) {
          setState({ artistId: '', loading: false, error: res.status === 403 ? 'Must be an artist to upload tracks.' : 'An error occurred.', submitted: false });
          return;
        }
        return res.json().then((data: { artistProfileId: string }) =>
          setState({ artistId: data.artistProfileId, loading: false, error: null, submitted: false }));
      })
      .catch(() => {
        setState({ artistId: '', loading: false, error: 'Unable to verify session. Please log in.', submitted: false });
      });
  }, []);

  if (state.loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        role="status"
        aria-label="Loading upload page"
      >
        <p className="text-muted-foreground">Loading...</p>
        <span className="sr-only">Loading upload form</span>
      </div>
    );
  }

  if (!state.artistId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background text-foreground"
        role="alert"
      >
        <div className="text-center p-6 max-w-md">
          <h1 className="text-2xl font-bold text-destructive">Authentication Required</h1>
          <p className="mt-2 text-muted-foreground">{state.error}</p>
        </div>
      </div>
    );
  }

  if (state.submitted) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-green-500 mb-2">Metadata Saved</h1>
            <p className="text-muted-foreground">Your track metadata has been recorded. Proceeding to upload...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Upload a Track</h1>
          <p className="text-muted-foreground">Share your music with the world.</p>
        </div>
        <MetadataEntryForm
          onSubmit={(data) => {
            handleSubmitMetadata(state.artistId, data);
          }}
        />
      </div>
    </main>
  );
}

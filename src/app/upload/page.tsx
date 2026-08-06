/**
 * STORY-track-006: Track Upload Page
 *
 * Client-side page that verifies artist session and renders the TrackUploadWizard.
 * Routes to the track upload form for authenticated artists.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { TrackUploadWizard, type TrackUploadComplete } from '@/components/TrackUploadWizard';

interface UploadPageState {
  artistId: string | null;
  loading: boolean;
  error: string | null;
}

export default function UploadPage() {
  const [state, setState] = useState<UploadPageState>({
    artistId: null,
    loading: true,
    error: null,
  });

  const handleComplete = useCallback((data: TrackUploadComplete) => {
    if (data.trackId) {
      window.location.href = `/tracks/${data.trackId}`;
    }
  }, []);

  useEffect(() => {
    fetch('/api/v1/users/me')
      .then((res) => {
        if (!res.ok && res.status === 401) {
          setState({ artistId: null, loading: false, error: 'Please log in as an artist to upload tracks.' });
          return;
        }
        if (!res.ok) {
          setState({ artistId: null, loading: false, error: res.status === 403 ? 'Must be an artist to upload tracks.' : 'An error occurred.' });
          return;
        }
        return res.json().then((data: { artistProfileId: string }) =>
          setState({ artistId: data.artistProfileId, loading: false, error: null }));
      })
      .catch(() => {
        setState({ artistId: null, loading: false, error: 'Unable to verify session. Please log in.' });
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Upload a Track</h1>
          <p className="text-muted-foreground">Share your music with the world.</p>
        </div>
        <TrackUploadWizard artistId={state.artistId} onComplete={handleComplete} />
      </div>
    </main>
  );
}

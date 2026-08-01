/**
 * STORY-storage-004: Upload page
 *
 * Simple client-side page that wires up useDirectUpload and FileUploadProgress
 * for artist track uploads. Used as the target for E2E testing.
 */
'use client';

import { useDirectUpload, type UploadIntentResponse } from '@/hooks/use-direct-upload';
import { FileUploadProgress } from '@/components/FileUploadProgress';

export default function UploadPage() {
  const upload = useDirectUpload({
    artistId: 'artist-001',
    trackId: 'track-001',
    onComplete: (response: UploadIntentResponse) => {
      console.log('Upload complete:', response.objectKey);
    },
    onError: (error) => {
      console.error('Upload error:', error);
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="py-12 px-4">
        <h1 className="text-2xl font-bold text-center mb-6">Upload Audio Track</h1>
        <FileUploadProgress hook={upload} />
      </main>
    </div>
  );
}

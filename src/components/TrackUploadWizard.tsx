/**
 * STORY-track-006c — TrackUploadWizard
 *
 * A wrapper component that wires the MetadataEntryForm into the upload page,
 * manages the multi-step upload flow, and emits a completion event.
 *
 * The current step is the metadata entry form. Future stories (track-006d, etc.)
 * will add step 2 (file upload) and step 3 (confirmation).
 */

'use client';

import { MetadataEntryForm, type MetadataFormData } from '@/components/metadata/MetadataEntryForm';

export interface TrackUploadComplete {
  trackId?: string;
  metadata: MetadataFormData;
}

export interface TrackUploadWizardProps {
  artistId: string;
  onComplete: (data: TrackUploadComplete) => void;
}

export function TrackUploadWizard({
  artistId: _artistId,
  onComplete,
}: TrackUploadWizardProps) {
  function handleMetadataSubmit(data: MetadataFormData): void {
    // For now, emit completion with metadata; actual track creation comes in STORY-track-006d
    onComplete({
      metadata: data,
    });
  }

  return (
    <div className="rounded-lg border p-6 bg-card text-card-foreground">
      <h2 className="text-xl font-bold text-foreground mb-4">Track Metadata</h2>
      <MetadataEntryForm onSubmit={handleMetadataSubmit} />
    </div>
  );
}

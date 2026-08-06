/**
 * STORY-track-006: TrackUploadWizard
 *
 * Multi-step wizard for uploading a track with:
 * - Step 1: Audio file drag-and-drop (MP3/WAV, max 50MB)
 * - Step 2: Metadata form (title 1-100, genre dropdown, description 500max, cover image)
 * - Step 3: Upload progress bar (presigned URL PUT) with WCAG 2.1 AA accessibility
 * - Step 4: Success redirect to published track
 * - Overlays error banners with retry on any failure
 */
'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { UseDirectUploadReturn, UploadError, UploadIntentResponse, UploadProgress } from '@/hooks/use-direct-upload';
import { validateUploadFile, MAX_AUDIO_UPLOAD_SIZE } from '@/hooks/use-direct-upload';

// ── Constants ────────────────────────────────────────────────────────

export const MAX_TITLE_LENGTH = 100;
export const MAX_DESC_LENGTH = 500;

export const GENRES = [
  'INDIE_ROCK',
  'BEDROOM_POP',
  'ELECTRONIC',
  'HIP_HOP',
  'LO_FI',
  'AMBIENT',
  'R_AND_B',
  'FOLK',
  'OTHER',
] as const;

export type GenreType = (typeof GENRES)[number];

// Cover image allowed types
const ALLOWED_COVER_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5 MB

// ── Types ────────────────────────────────────────────────────────────

export type WizardStep = 'audio' | 'metadata' | 'upload' | 'success' | 'error' | 'abort';

export interface TrackMetadata {
  title: string;
  genre: GenreType;
  description: string;
}

export interface TrackUploadState {
  step: WizardStep;
  metadata: TrackMetadata;
  selectedAudioFile: File | null;
  coverFile: File | null;
  audioUrl: string;
  coverUrl: string;
  audioStorageKey: string;
  coverStorageKey: string;
}

export interface TrackUploadArtistId: string;
```

Now I'll write the Playwright E2E test that tests the full track upload flow.
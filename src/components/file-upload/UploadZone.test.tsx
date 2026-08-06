/**
 * STORY-track-006b: Tests for UploadZone component.
 *
 * Covers:
 * - Renders drop zone with styled border and hover state
 * - Accepts MP3 and WAV files (validates via validateFile)
 * - Rejects files exceeding 50 MB or wrong format
 * - Displays file preview name for accepted files
 * - Shows rejection messages for rejected files
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadZone } from './UploadZone';
import * as validation from './validation';

// Helpers
function makeFile(name: string, type: string, size: number): File {
  return new File([new ArrayBuffer(Math.max(size, 1))], name, { type });
}

/** By default, all files under 50 MB that are audio pass validation. */
function defaultSpy() {
  vi.spyOn(validation, 'validateFile').mockImplementation((file) => {
    const isAudio = ['audio/mpeg', 'audio/wav', 'audio/mp3'].includes(
      file.type.toLowerCase()
    ) || file.type.startsWith('audio/');
    const ok = isAudio && file.size <= validation.MAX_UPLOAD_SIZE;
    if (ok) {
      return { valid: true, error: null };
    }
    return {
      valid: false,
      error: isAudio
        ? `${file.name}: file exceeds 50 MB limit`
        : `${file.name}: unsupported file type. Only MP3 and WAV are accepted`,
    };
  });
}

function getInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('file input not found');
  return input;
}

describe('UploadZone', () => {
  beforeEach(() => {
    defaultSpy();
  });

  it('renders a visible drop zone with text prompts', () => {
    render(<UploadZone />);
    expect(
      screen.getByRole('button', { name: /drop audio files here or click to browse/i }),
    ).toBeInTheDocument();
  });

  it('shows MP3 or WAV and maximum size hint', () => {
    render(<UploadZone />);
    expect(screen.getByText(/MP3 or WAV/)).toBeInTheDocument();
    expect(screen.getByText(/Maximum 50\.0 MB/)).toBeInTheDocument();
  });

  it('applies drag-active styling when dragging over', () => {
    const { container } = render(<UploadZone />);
    const zone = container.querySelector('[role="button"]');
    expect(zone).not.toBeNull();
    fireEvent.dragEnter(zone!, { dataTransfer: { files: [] } });
    expect(zone!.className).toContain('border-primary');
  });

  it('shows hover border via className when not dragging', () => {
    const { container } = render(<UploadZone />);
    const zone = container.querySelector('[role="button"]');
    expect(zone!.className).toContain('hover:border-primary');
  });

  it('accepts an MP3 file and shows name preview', () => {
    const handleAccepted = vi.fn();
    render(<UploadZone onFilesAccepted={handleAccepted} />);

    const file = makeFile('track.mp3', 'audio/mpeg', 1000);
    const input = getInput();
    fireEvent.change(input, { target: { files: [file] } });

    expect(handleAccepted).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'track.mp3' })]),
    );
    expect(screen.getByText('track.mp3')).toBeInTheDocument();
  });

  it('accepts a WAV file and shows name preview', () => {
    const handleAccepted = vi.fn();
    render(<UploadZone onFilesAccepted={handleAccepted} />);

    const file = makeFile('sound.wav', 'audio/wav', 2000);
    const input = getInput();
    fireEvent.change(input, { target: { files: [file] } });

    expect(handleAccepted).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'sound.wav' })]),
    );
    expect(screen.getByText('sound.wav')).toBeInTheDocument();
  });

  it('rejects files exceeding 50 MB', () => {
    const handleRejected = vi.fn();
    vi.spyOn(validation, 'validateFile').mockImplementation((file) => {
      if (file.size > validation.MAX_UPLOAD_SIZE) {
        return { valid: false, error: `${file.name}: file exceeds 50 MB limit` };
      }
      return { valid: true, error: null };
    });

    render(<UploadZone onFilesRejected={handleRejected} />);

    const largeFile = makeFile('huge.mp3', 'audio/mpeg', 51 * 1024 * 1024);
    const input = getInput();
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(handleRejected).toHaveBeenCalled();
    expect(screen.getByText(/file exceeds/)).toBeInTheDocument();
  });

  it('rejects a non-audio file type with visible message', () => {
    const handleRejected = vi.fn();
    vi.spyOn(validation, 'validateFile').mockImplementation((file) => {
      if (!file.type.startsWith('audio/')) {
        return {
          valid: false,
          error: `${file.name}: unsupported file type. Only MP3 and WAV are accepted`,
        };
      }
      return { valid: true, error: null };
    });

    render(<UploadZone onFilesRejected={handleRejected} />);

    const imageFile = makeFile('photo.png', 'image/png', 1000);
    const input = getInput();
    fireEvent.change(input, { target: { files: [imageFile] } });

    expect(handleRejected).toHaveBeenCalled();
    expect(screen.getByText(/unsupported file type/)).toBeInTheDocument();
  });

  it('renders displayed file size for accepted files', () => {
    const handleAccepted = vi.fn();
    render(<UploadZone onFilesAccepted={handleAccepted} />);

    const file = makeFile('track.mp3', 'audio/mpeg', 1048576); // 1 MB
    const input = getInput();
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });
});

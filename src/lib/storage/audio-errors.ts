/**
 * STORY-track-002b: Custom error for audio metadata parsing failures.
 */
export class CorruptedAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptedAudioError';
  }
}

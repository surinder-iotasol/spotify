/**
 * Genre constants for the track upload form.
 * Mirrorprisms Genre enum as a flat list with display labels.
 */

export interface GenreOption {
  value: string;
  label: string;
}

export const GENRE_OPTIONS: GenreOption[] = [
  { value: 'INDIE_ROCK', label: 'Indie Rock' },
  { value: 'BEDROOM_POP', label: 'Bedroom Pop' },
  { value: 'ELECTRONIC', label: 'Electronic' },
  { value: 'HIP_HOP', label: 'Hip-Hop' },
  { value: 'LO_FI', label: 'Lo-Fi' },
  { value: 'AMBIENT', label: 'Ambient' },
  { value: 'R_AND_B', label: 'R&B' },
  { value: 'FOLK', label: 'Folk' },
  { value: 'OTHER', label: 'Other' },
];

export function getGenreLabel(genre: string): string {
  return GENRE_OPTIONS.find((g) => g.value === genre)?.label ?? genre;
}

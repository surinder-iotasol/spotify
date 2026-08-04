/**
 * STORY-track-002a: Audio Metadata Extraction Service
 *
 * Provides the core audio metadata extraction pipeline for MP3, WAV, and OGG
 * container formats. Reads file headers from object storage, validates format
 * signatures, extracts duration / bitrate / sample-rate / channel-count, and
 * returns a structured `AudioMetadata` object.
 *
 * All parsing errors surface as `CorruptedAudioError` so callers can distinguish
 * genuine file corruption from transient I/O failures.
 */

import type { StorageProvider } from "@/lib/storage/storage-provider";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Structured audio metadata extracted from a container header.
 * All numeric values are in standard units (seconds, bps, Hz).
 */
export interface AudioMetadata {
  /** Audio duration in seconds (float). */
  duration: number;
  /** Audio duration in milliseconds (integer). */
  durationMs: number;
  /** Bitrate in bits per second. */
  bitrate: number;
  /** Sample rate in Hz (e.g., 44100, 48000). */
  sampleRate: number;
  /** Number of audio channels (1 = mono, 2 = stereo). */
  channels: number;
  /** Codec / container format identifier (e.g., "mp3", "wav", "ogg"). */
  codec: string;
}

/**
 * Alias exported as `AudioMetadataInfo` to satisfy the canonical type name
 * used across all downstream header parsers.
 */
export type AudioMetadataInfo = AudioMetadata;

/* ------------------------------------------------------------------ */
/*  Custom error                                                       */
/* ------------------------------------------------------------------ */

/**
 * Error thrown when an audio file is malformed or corrupted.
 *
 * Carries a human-readable `message` describing the corruption reason
 * and the storage `key` of the offending file for debugging / logging.
 */
export class CorruptedAudioError extends Error {
  /** Object storage key of the corrupted file. */
  public readonly key: string;

  /** File key — alias for `key` to match the canonical PRD field name. */
  public readonly fileKey: string;

  /** Reason — alias of `message` for the canonical PRD field name. */
  public readonly reason: string;

  constructor(message: string, key: string) {
    super(message);
    this.name = "CorruptedAudioError";
    this.key = key;
    this.fileKey = key;
    this.reason = message;

    // Preserve the proper prototype chain (required when extending built-in
    // classes across compilation targets).
    Object.setPrototypeOf(this, CorruptedAudioError.prototype);
  }
}

/* ------------------------------------------------------------------ */
/*  Service function                                                   */
/* ------------------------------------------------------------------ */

/**
 * Extract structured metadata from the header bytes of an audio file.
 *
 * @param storage  — StorageProvider capable of reading header bytes.
 * @param fileKey  — Object storage key identifying the audio file.
 * @returns        — Promise resolving to parsed `AudioMetadata`.
 * @throws CorruptedAudioError when the file cannot be read or its header
 *                       does not match any known container format.
 *
 * The function delegates to format-specific parsers
 * (`parseMp3Header`, `parseWavHeader`, `parseOggHeader`) that are added
 * in subsequent stories (STORY-track-002b, etc.).  Each parser receives
 * the raw header `Buffer` and the `fileKey` so it can enrich errors.
 */
export async function extractAudioMetadata(
  storage: StorageProvider,
  fileKey: string,
): Promise<AudioMetadata> {
  // 1. Read initial header bytes (up to 8 KB is enough for every major
  //    audio container sync marker).
  const header = await storage.readHeaderBytes(fileKey, {
    byteCount: 8192,
  });

  if (header.length === 0) {
    throw new CorruptedAudioError(
      "File is empty — no header bytes available",
      fileKey,
    );
  }

  // 2. Detect container format by magic bytes.
  const codec = detectCodec(header);
  if (!codec) {
    throw new CorruptedAudioError(
      `Unrecognized audio container format in header`,
      fileKey,
    );
  }

  // 3. Parse metadata via the appropriate decoder (stubs for now).
  const metadata = parseByCodec(header, codec, fileKey);

  return metadata;
}

/* ------------------------------------------------------------------ */
/*  Format detection (stub — expanded in later stories)                */
/* ------------------------------------------------------------------ */

/**
 * Detect the audio codec from header magic bytes.
 *
 * @param header — Raw header buffer (minimum 4 bytes expected).
 * @returns      — Known codec identifier or `null` if unrecognized.
 */
function detectCodec(header: Buffer): string | null {
  // MP3: 0xFF 0xFB or 0xFF 0xF3 (MPEG-1/2 layer 3 sync word)
  if (header.length >= 2) {
    const b0 = header[0];
    const b1 = header[1];
    if (b0 === 0xff && (b1 & 0xfb) === 0xfb) {
      return "mp3";
    }
  }

  // WAV: "RIFF" + "WAVE" at offset 8
  if (header.length >= 12) {
    const riff = header.subarray(0, 4).toString("ascii");
    const wave = header.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && wave === "WAVE") {
      return "wav";
    }
  }

  // OGG: "OggS" magic bytes
  if (header.length >= 4 && header.subarray(0, 4).toString("ascii") === "OggS") {
    return "ogg";
  }

  return null;
}

/**
 * Dispatch to the appropriate format parser.
 *
 * Each parser is a focused, testable function.  Implementations for MP3,
 * WAV, and OGG arrive in subsequent stories.  For now they throw a
 * `CorruptedAudioError` so callers still get a structured failure.
 */
function parseByCodec(
  header: Buffer,
  codec: string,
  fileKey: string,
): AudioMetadata {
  switch (codec) {
    case "mp3":
      return parseMp3Header(header, fileKey);
    case "wav":
      return parseWavHeader(header, fileKey);
    case "ogg":
      return parseOggHeader(header, fileKey);
    default:
      throw new CorruptedAudioError(
        `No parser implemented for codec: ${codec}`,
        fileKey,
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Format parsers (stubs — implementations added in later stories)    */
/* ------------------------------------------------------------------ */

function parseMp3Header(_header: Buffer, key: string): AudioMetadata {
  throw new CorruptedAudioError(
    "MP3 header parsing not yet implemented",
    key,
  );
}

function parseWavHeader(_header: Buffer, key: string): AudioMetadata {
  throw new CorruptedAudioError(
    "WAV header parsing not yet implemented",
    key,
  );
}

function parseOggHeader(_header: Buffer, key: string): AudioMetadata {
  throw new CorruptedAudioError(
    "OGG header parsing not yet implemented",
    key,
  );
}

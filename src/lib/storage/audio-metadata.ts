/**
 * STORY-track-002b: MP3 and WAV binary header parsing utilities.
 *
 * Parses MP3 MPEG frame headers and WAV RIFF fmt/data chunks to extract
 * metadata (duration, bitrate, sample rate, channel count) from raw audio
 * file bytes. Uses StorageProvider.readHeaderBytes interface.
 */
import { CorruptedAudioError } from './audio-errors';

// ── MPEG Audio Bitrate Lookup Tables ──────────────────────────────────

/** MPEG-1 Layer I, II, III bitrate indices (kbps) */
const MPEG1_BITRATES: Record<string, number[]> = {
  '1': [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '2': [32, 48, 56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384],
  '3': [32, 40, 48,  56,  64,  80, 112, 128, 160, 192, 224, 256, 320, 384],
};

/** MPEG-2 (and MPEG-2.5) Layer I, II, III bitrate indices (kbps) */
const MPEG2_BITRATES: Record<string, number[]> = {
  '1': [32, 48, 56,  64,  80,  88, 112, 128, 144, 160, 176, 192, 224, 256],
  '2': [8,  16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],
  '3': [8,  16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],
};

/** MPEG-1 sample rate indices (Hz) */
const MPEG1_SAMPLE_RATES: Record<string, number[]> = {
  '1': [44100, 48000, 32000],
  '2': [22050, 24000, 16000],
};

/** MPEG-2 sample rate indices (Hz) */
const MPEG2_SAMPLE_RATES: Record<string, number[]> = {
  '1': [24000, 22050, 16000],
  '2': [12000, 11025, 8000],
};

// ── MPEG frame duration in samples (per frame) ────────────────────────

/** MPEG-1 Layer III frame samples */
const MPEG1_L3_SAMPLES = 1152;
/** MPEG-2 Layer III frame samples */
const MPEG2_L3_SAMPLES = 576;
/** MPEG-2.5 Layer III frame samples */
const MPEG2_5_L3_SAMPLES = 576;

// ── Interfaces ───────────────────────────────────────────────────────

/**
 * Audio metadata extracted from binary header bytes.
 */
export interface AudioMetadata {
  /** Audio format identifier */
  format: 'MP3' | 'WAV' | string;
  /** Duration in float seconds */
  duration: number;
  /** Bitrate in bits per second */
  bitrate: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channelCount: number;
  /** WAV-specific: bits per sample */
  bitsPerSample?: number;
  /** WAV-specific: data chunk size in bytes */
  dataSize?: number;
}

/**
 * MP3 frame header parsed metadata.
 */
interface Mp3FrameInfo {
  version: number;       // 0=MPEG-2, 1=MPEG-2.5, 2=MPEG-1
  layer: number;         // 1, 2, or 3
  bitrate: number;       // bits per second
  sampleRate: number;    // Hz
  channelCount: number;  // 1 or 2
  frameDuration: number; // seconds per frame
}

// ── MP3 Parsing ──────────────────────────────────────────────────────

/**
 * Parse an MP3 frame header to extract bitrate, sample rate, channel count,
 * and frame duration. Throws CorruptedAudioError on invalid headers.
 *
 * @param header - At least 4 bytes from the start of an MP3 stream
 * @returns Parsed MPEG frame information
 */
export function parseMp3Header(header: Buffer): Mp3FrameInfo {
  if (header.length < 4) {
    throw new CorruptedAudioError(
      'MP3 header too short: need at least 4 bytes, got ' + header.length,
    );
  }

  // Check sync word: first 11 bits must be 1
  // Standard MP3: byte[0] == 0xFF && (byte[1] & 0xE0) == 0xE0
  if (header[0] !== 0xFF || (header[1] & 0xe0) !== 0xe0) {
    throw new CorruptedAudioError(
      'MP3 sync word missing or invalid: no MPEG frame header found',
    );
  }

  // Standard MPEG audio frame header: after 11-bit sync, version occupies bits 4-3,
  // layer occupies bits 2-1 of byte 1.
  const versionBit = (header[1] >> 3) & 0x03;
  const layerBit = (header[1] >> 1) & 0x03;
  const bitrateIdx = (header[2] >> 4) & 0x0F;
  const sampleRateIdx = (header[2] >> 2) & 0x03;
  const channelMode = (header[3] >> 6) & 0x03;

  // Layer encoding: 1=Layer I, 2=Layer II, 3=Layer III
  if (layerBit !== 3) {
    throw new CorruptedAudioError(
      'MP3 parsing: only Layer III supported, got layer ' + (4 - layerBit),
    );
  }

  // Version: 11=MPEG-1, 10=MPEG-2, 00=MPEG-2.5
  let version: number; // 0=MPEG-2.5, 1=MPEG-2, 2=MPEG-1
  if (versionBit === 3) {
    version = 2; // MPEG-1
  } else if (versionBit === 2) {
    version = 1; // MPEG-2
  } else {
    version = 0; // MPEG-2.5
  }

  // Determine bitrate
  let bitrateKbps: number;
  const bitrateTable = version === 2 ? MPEG1_BITRATES : MPEG2_BITRATES;
  const layerKey = String(layerBit);
  const bitrateMap = bitrateTable[layerKey] || MPEG2_BITRATES['3'];
  bitrateKbps = bitrateMap[bitrateIdx] || 0;

  const bitrate = bitrateKbps * 1000;

  // Determine sample rate
  let sampleRate: number;
  const sampleRateTable = version === 2 ? MPEG1_SAMPLE_RATES : MPEG2_SAMPLE_RATES;
  const srKey = String(layerBit);
  const srMap = sampleRateTable[srKey] || MPEG2_SAMPLE_RATES['2'];
  sampleRate = srMap[sampleRateIdx] || 0;

  // Channel count
  const channelCount = channelMode === 3 ? 1 : 2; // 3=single, 0=stereo

  // Frame duration
  const samplesPerFrame =
    version === 2 ? MPEG1_L3_SAMPLES : // MPEG-1: 1152
    version === 1 ? MPEG2_L3_SAMPLES : // MPEG-2: 576
    MPEG2_5_L3_SAMPLES;                // MPEG-2.5: 576
  const frameDuration = samplesPerFrame / sampleRate;

  return {
    version,
    layer: layerBit,
    bitrate,
    sampleRate,
    channelCount,
    frameDuration,
  };
}

// ── WAV Duration Calculation ─────────────────────────────────────────

/**
 * Calculate precise float duration in seconds from WAV format parameters.
 *
 * Duration = dataSize / (sampleRate * channels * bitsPerSample / 8)
 *
 * The divisor `bitsPerSample / 8` gives bytes-per-sample, so the denominator
 * is bytes per second (i.e. `bytesPerSecond` from the fmt chunk).
 *
 * @param dataSize - Data chunk size in bytes
 * @param sampleRate - Sample rate in Hz (e.g. 44100)
 * @param channels - Number of audio channels (1 = mono, 2 = stereo)
 * @param bitsPerSample - Bits per sample per channel (8 or 16 for PCM)
 * @returns Duration in float seconds
 * @throws CorruptedAudioError when params are invalid or data chunk info is missing
 */
export function calculateWavDuration(
  dataSize: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): number {
  // Validate that we have meaningful format info
  if (sampleRate <= 0) {
    throw new CorruptedAudioError(
      'WAV duration: invalid sample rate ' + sampleRate + ' (must be > 0)',
    );
  }
  if (channels <= 0) {
    throw new CorruptedAudioError(
      'WAV duration: invalid channel count ' + channels + ' (must be > 0)',
    );
  }
  if (bitsPerSample <= 0) {
    throw new CorruptedAudioError(
      'WAV duration: invalid bits per sample ' + bitsPerSample + ' (must be > 0)',
    );
  }
  if (dataSize < 0) {
    throw new CorruptedAudioError(
      'WAV duration: data chunk size is negative (' + dataSize + ' bytes)',
    );
  }

  // bytesPerSample converts bits to bytes; blockAlign = channels * bytesPerSample
  const bytesPerSample = bitsPerSample / 8;
  const bytesPerSecond = sampleRate * channels * bytesPerSample;

  // Duration in seconds: total bytes / bytes per second
  return dataSize / bytesPerSecond;
}

// ── WAV Parsing ──────────────────────────────────────────────────────

/**
 * Parse a WAV (RIFF) binary header to extract sample rate, channel count,
 * bitrate, and duration from the fmt and data chunks.
 *
 * @param data - WAV file bytes (at minimum: RIFF header + fmt chunk)
 * @returns AudioMetadata with WAV-specific fields
 */
export function parseWavHeader(data: Buffer): AudioMetadata {
  if (data.length < 12) {
    throw new CorruptedAudioError(
      'WAV header too short: need at least 12 bytes for RIFF header, got ' + data.length,
    );
  }

  // Verify RIFF magic
  const riffMagic = data.toString('ascii', 0, 4);
  if (riffMagic !== 'RIFF') {
    throw new CorruptedAudioError('WAV file: missing RIFF magic bytes');
  }

  // Verify WAVE type
  const waveMagic = data.toString('ascii', 8, 12);
  if (waveMagic !== 'WAVE') {
    throw new CorruptedAudioError('WAV file: missing WAVE type');
  }

  // Parse chunks to find 'fmt ' and 'data' chunks
  let fmtOffset = -1;
  let fmtSize = -1;
  let dataOffset = -1;
  let dataSize = -1;

  let offset = 12; // Skip RIFF header (4 + 4 + 4 bytes)
  const end = Math.min(data.length, 0xFFFF);

  while (offset + 8 <= data.length) {
    const chunkId = data.toString('ascii', offset, offset + 4);
    const chunkSize = data.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      fmtOffset = offset + 8;
      fmtSize = chunkSize;
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      // We can stop here since we found both chunks
      break;
    }

    offset += 8 + chunkSize;
    // Chunk size is padded to even boundary
    if (chunkSize % 2 !== 0) {
      offset += 1;
    }
  }

  if (fmtOffset === -1 || fmtSize < 16) {
    throw new CorruptedAudioError(
      'WAV file: missing or truncated fmt chunk',
    );
  }

  if (dataOffset === -1 || dataSize === -1) {
    throw new CorruptedAudioError(
      'WAV file: missing data chunk',
    );
  }

  // Parse fmt chunk fields (little-endian)
  const audioFormat = data.readUInt16LE(fmtOffset);
  const channelCount = data.readUInt16LE(fmtOffset + 2);
  const sampleRate = data.readUInt32LE(fmtOffset + 4);
  const bytesPerSecond = data.readUInt32LE(fmtOffset + 8);
  const blockAlign = data.readUInt16LE(fmtOffset + 12);
  const bitsPerSample = data.readUInt16LE(fmtOffset + 14);

  if (audioFormat !== 1) {
    throw new CorruptedAudioError(
      'WAV file: unsupported audio format ' +
        audioFormat +
        ' (only PCM format 1 is supported)',
    );
  }

  const bitrate = sampleRate * channelCount * bitsPerSample;
  const duration = calculateWavDuration(dataSize, sampleRate, channelCount, bitsPerSample);

  return {
    format: 'WAV',
    duration,
    bitrate,
    sampleRate,
    channelCount,
    bitsPerSample,
    dataSize,
  };
}

// ── Unified Audio Metadata Extraction ────────────────────────────────

/**
 * Extract audio metadata from raw file bytes based on MIME type.
 *
 * Dispatches to the appropriate parser (MP3 or WAV) based on the
 * contentType parameter. Uses StorageProvider.readHeaderBytes interface
 * for fetching bytes.
 *
 * @param headerBytes - Raw audio file bytes
 * @param contentType - MIME type of the audio file
 * @returns AudioMetadata with parsed fields
 * @throws CorruptedAudioError on invalid or unsupported audio format
 */
export function extractAudioMetadata(
  headerBytes: Buffer,
  contentType: string,
): AudioMetadata {
  if (!headerBytes || headerBytes.length === 0) {
    throw new CorruptedAudioError(
      'Audio metadata extraction failed: empty buffer',
    );
  }

  const mime = contentType.toLowerCase().trim();

  if (mime.includes('mpeg') || mime.includes('mp3')) {
    const mp3Info = parseMp3Header(headerBytes);
    return {
      format: 'MP3',
      duration: mp3Info.frameDuration,
      bitrate: mp3Info.bitrate,
      sampleRate: mp3Info.sampleRate,
      channelCount: mp3Info.channelCount,
    };
  }

  if (mime.includes('wav') || mime.includes('wave')) {
    return parseWavHeader(headerBytes);
  }

  throw new CorruptedAudioError(
    'Audio format not supported: ' + contentType + ' (only MP3 and WAV supported)',
  );
}

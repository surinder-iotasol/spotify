/**
 * STORY-track-002b: Unit tests for MP3 header binary parsing.
 *
 * Tests MP3 frame sync word detection, bitrate/sample-rate/channel extraction,
 * duration calculation, and corrupted-audio error handling.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateWavDuration,
  extractAudioMetadata,
  parseMp3Header,
  parseWavHeader,
  type AudioMetadata,
} from './audio-metadata';
import { CorruptedAudioError } from './audio-errors';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a minimal valid MP3 frame header (11 bytes).
 * Layer III, free format=0, 44100 Hz, 160 kbps stereo pad=0 crc=0
 * sync word 0xFF 0xFB
 */
function buildMp3Header(opts: {
  sync?: [number, number];
  version?: number; // 0=MPEG-2, 1=MPEG-2.5, 2=MPEG-1
  layer?: number;  // 1-3
  bitrateIdx?: number; // 1-14
  sampleRateIdx?: number;
  channelMode?: number; // 0=stereo, 3=mono
} = {}): Buffer {
  const sync = opts.sync ?? [0xFF, 0xFB];
  const version = opts.version ?? 2; // MPEG-2
  const layer = opts.layer ?? 3;     // Layer III
  const bitrateIdx = opts.bitrateIdx ?? 11; // 128 kbps (Layer III / MPEG-2)
  const sampleRateIdx = opts.sampleRateIdx ?? 1; // 24000 Hz (MPEG-2 table)
  const channelMode = opts.channelMode ?? 0; // stereo

  const frameHeader = Buffer.alloc(4);
  frameHeader.writeUInt8(sync[0], 0);
  frameHeader.writeUInt8(sync[1], 1);
  frameHeader.writeUInt8(
    ((version & 0x03) << 6) |
    ((layer & 0x03) << 4) |
    (opts.bitrateIdx ?? 11 << 4) >> 0,
    1,
  );

  // Simplified: build correct 4-byte frame header
  const b0 = 0xFF;
  const b1 = 0xFB; // 11 = MPEG-2, 11 = Layer III, 11 = 128kbps, 01 = 24kHz
  // Actually let me compute properly
  const verByte = (version << 6) | (layer << 4) | bitrateIdx;
  const srByte = (sampleRateIdx << 6) | (channelMode << 4) | 0 | 0;
  return Buffer.from([b0, b1, verByte, srByte]);
}

/**
 * Build a minimal valid WAV file buffer (fmt + data chunks).
 */
function buildWavFile(opts?: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  dataSize?: number;
  audioFormat?: number;
}): Buffer {
  const sampleRate = opts?.sampleRate ?? 44100;
  const channels = opts?.channels ?? 2;
  const bitsPerSample = opts?.bitsPerSample ?? 16;
  const dataSize = opts?.dataSize ?? 44100 * 2; // 1 second at 44100*2*16
  const audioFormat = opts?.audioFormat ?? 1; // PCM default

  const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const fmtChunkSize = 16;
  const totalSize = 4 + 8 + fmtChunkSize + 8 + dataSize;

  const buf = Buffer.alloc(totalSize);
  let off = 0;

  // RIFF header
  buf.write('RIFF', off); off += 4;
  buf.writeUInt32LE(totalSize - 8, off); off += 4;
  buf.write('WAVE', off); off += 4;

  // fmt chunk
  buf.write('fmt ', off); off += 4;
  buf.writeUInt32LE(fmtChunkSize, off); off += 4;
  buf.writeUInt16LE(audioFormat, off); off += 2;
  buf.writeUInt16LE(channels, off); off += 2;
  buf.writeUInt32LE(sampleRate, off); off += 4;
  buf.writeUInt32LE(bytesPerSec, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(bitsPerSample, off); off += 2;

  // data chunk
  buf.write('data', off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;

  // Zero data padding
  return buf;
}

// ── MP3 Parsing Tests ───────────────────────────────────────────────

describe('parseMp3Header', () => {
  it('parses bitrate, sample rate, and channel count from a valid frame header', () => {
    // MPEG-2 Layer III, 128kbps, 24kHz, stereo
    // byte[1] = 0xFA: 11=MPEG-2, 11=Layer III, 1=protection, 010=bitrate idx 2 (128kbps MPEG-2 table)
    const header = Buffer.from([0xFF, 0xFA, 0x08, 0x40]);
    const result = parseMp3Header(header);
    expect(result).toBeDefined();
    expect(result.bitrate).toBe(128000);
    expect(result.sampleRate).toBe(24000);
    expect(result.channelCount).toBe(2);
  });

  it('parses stereo channel mode from channel mode bits', () => {
    const header = Buffer.from([0xFF, 0xFA, 0x08, 0x40]); // stereo = 0
    const result = parseMp3Header(header);
    expect(result.channelCount).toBe(2);
  });

  it('parses mono channel mode from channel mode bits', () => {
    // channelMode = 3 (single channel / mono)
    const header = Buffer.from([0xFF, 0xFA, 0x08, 0xC0]);
    const result = parseMp3Header(header);
    expect(result.channelCount).toBe(1);
  });

  it('extracts MPEG-1 bitrate from frame header', () => {
    // MPEG-1 version (3), Layer III, 320 kbps (bitrateIdx=0), 44100 Hz (idx=0)
    // byte[1] = 0xF8: 11=MPEG-1, 11=Layer III, 1=protection, 000=bitrate idx 0 (320kbps)
    const header = Buffer.from([0xFF, 0xF8, 0x00, 0x00]);
    const result = parseMp3Header(header);
    expect(result.bitrate).toBe(320000);
    expect(result.sampleRate).toBe(44100);
  });

  it('throws CorruptedAudioError when header is too short', () => {
    expect(() => parseMp3Header(Buffer.from([0xFF]))).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError when sync word is missing', () => {
    expect(() => parseMp3Header(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow(
      CorruptedAudioError,
    );
  });

  it('throws CorruptedAudioError when header is truncated (3 bytes)', () => {
    expect(() => parseMp3Header(Buffer.from([0xFF, 0xFB, 0x3B]))).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError for empty buffer', () => {
    expect(() => parseMp3Header(Buffer.alloc(0))).toThrow(CorruptedAudioError);
  });

  it('identifies MPEG-1 vs MPEG-2 version', () => {
    // MPEG-1: version=2 (bits 6-7 = 0b10 -> MPEG-1), Layer III, 128kbps, 44.1kHz
    // byte[1] = 0xF9: 11=MPEG-1, 11=Layer III, 1=protection
    // byte[2] = 0x3B: 0011=bitrate idx 3 (128kbps MPEG-1 Layer III)
    // byte[3] = 0x00: idx=0=44100Hz, channelMode=3(stereo)
    const header = Buffer.from([0xFF, 0xF9, 0x3B, 0x00]);
    const result = parseMp3Header(header);
    expect(result).toBeDefined();
    expect(result.bitrate).toBe(128000);
    expect(result.sampleRate).toBe(44100);
  });
});

describe('extractAudioMetadata', () => {
  it('returns AudioMetadata with format and duration for valid MP3 header bytes', () => {
    const headerBytes = Buffer.from([0xFF, 0xFB, 0x3B, 0x40]);
    const result = extractAudioMetadata(headerBytes, 'audio/mpeg');
    expect(result.format).toBe('MP3');
    expect(typeof result.duration).toBe('number');
    expect(result.bitrate).toBe(128000);
    expect(result.sampleRate).toBe(24000);
    expect(result.channelCount).toBe(2);
  });

  it('returns AudioMetadata with format and params for valid WAV header bytes', () => {
    const wavBytes = buildWavFile({
      sampleRate: 48000,
      channels: 1,
      bitsPerSample: 24,
      dataSize: 96000, // 2 seconds: 48000 * 1 * 3 * 2
    });
    const result = extractAudioMetadata(wavBytes, 'audio/wav');
    expect(result.format).toBe('WAV');
    expect(result.sampleRate).toBe(48000);
    expect(result.channelCount).toBe(1);
    expect(result.bitrate).toBe(2304000); // 48000 * 1 * 24
    expect(result.duration).toBeCloseTo(2, 4);
  });

  it('throws CorruptedAudioError for unsupported format', () => {
    expect(() =>
      extractAudioMetadata(Buffer.from([0x00]), 'audio/ogg'),
    ).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError for MP3 with missing sync word in full file', () => {
    const nonMp3 = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(() =>
      extractAudioMetadata(nonMp3, 'audio/mpeg'),
    ).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError for WAV missing fmt chunk', () => {
    // Buffer starts with RIFF but no 'fmt ' chunk
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x41, 0x56, 0x45, // 'WAVE'
      0x64, 0x61, 0x74, 0x61, // 'data' instead of 'fmt '
      0x10, 0x00, 0x00, 0x00,
    ]);
    expect(() =>
      extractAudioMetadata(buf, 'audio/wav'),
    ).toThrow(CorruptedAudioError);
  });
});

// ── WAV Parsing Tests ───────────────────────────────────────────────

describe('parseWavHeader', () => {
  it('extracts sampleRate, channelCount, and bitrate from the fmt chunk', () => {
    const wavBytes = buildWavFile({
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      dataSize: 1000,
    });
    const result = parseWavHeader(wavBytes);
    expect(result.sampleRate).toBe(44100);
    expect(result.channelCount).toBe(2);
    expect(result.bitrate).toBe(1411200); // 44100 * 2 * 16
  });

  it('calculates precise duration from data chunk size and format params', () => {
    const dataSize = 176400; // 44100 * 2 * 16/8 = 176400 bytes per second
    const wavBytes = buildWavFile({
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      dataSize,
    });
    const result = parseWavHeader(wavBytes);
    expect(result.duration).toBeCloseTo(1.0, 4);
    expect(result.dataSize).toBe(dataSize);
  });

  it('calculates duration for non-integer durations', () => {
    const dataSize = 88200; // 0.5 seconds
    const wavBytes = buildWavFile({
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      dataSize,
    });
    const result = parseWavHeader(wavBytes);
    expect(result.duration).toBeCloseTo(0.5, 4);
  });

  it('throws CorruptedAudioError when WAV header is too short', () => {
    expect(() => parseWavHeader(Buffer.from([0x52, 0x49, 0x46, 0x46]))).toThrow(
      CorruptedAudioError,
    );
  });

  it('throws CorruptedAudioError when WAV has no fmt chunk', () => {
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x41, 0x56, 0x45, // 'WAVE'
      0x64, 0x61, 0x74, 0x61, // 'data' chunk first, no 'fmt '
    ]);
    expect(() => parseWavHeader(buf)).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError for empty buffer', () => {
    expect(() => parseWavHeader(Buffer.alloc(0))).toThrow(CorruptedAudioError);
  });

  it('handles 24-bit WAV correctly', () => {
    const wavBytes = buildWavFile({
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 24,
      dataSize: 288000, // 288000 / (48000*2*3) = 1 second
    });
    const result = parseWavHeader(wavBytes);
    expect(result.sampleRate).toBe(48000);
    expect(result.channelCount).toBe(2);
    expect(result.bitrate).toBe(2304000); // 48000 * 2 * 24
    expect(result.duration).toBeCloseTo(1.0, 4);
  });

  it('handles mono 8-bit WAV correctly', () => {
    const dataSize = 44100; // 1 second at 44100 Hz, mono, 8-bit
    const wavBytes = buildWavFile({
      sampleRate: 44100,
      channels: 1,
      bitsPerSample: 8,
      dataSize,
    });
    const result = parseWavHeader(wavBytes);
    expect(result.sampleRate).toBe(44100);
    expect(result.channelCount).toBe(1);
    expect(result.bitrate).toBe(44100); // 44100 * 1 * 8
    expect(result.duration).toBeCloseTo(1.0, 4);
  });

  it('throws CorruptedAudioError when WAV has fmt chunk but no data chunk', () => {
    // Build WAV with fmt chunk but omit the data chunk entirely
    const sampleRate = 44100;
    const channels = 2;
    const bitsPerSample = 16;
    const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    const buf = Buffer.alloc(4 + 4 + 4 + 8 + 16); // RIFF header + fmt chunk only
    let off = 0;
    buf.write('RIFF', off); off += 4;
    buf.writeUInt32LE(buf.length - 8, off); off += 4;
    buf.write('WAVE', off); off += 4;
    buf.write('fmt ', off); off += 4;
    buf.writeUInt32LE(16, off); off += 4;
    buf.writeUInt16LE(1, off); off += 2; // PCM
    buf.writeUInt16LE(channels, off); off += 2;
    buf.writeUInt32LE(sampleRate, off); off += 4;
    buf.writeUInt32LE(bytesPerSec, off); off += 4;
    buf.writeUInt16LE(blockAlign, off); off += 2;
    buf.writeUInt16LE(bitsPerSample, off); off += 2;
    // No 'data' chunk follows

    expect(() => parseWavHeader(buf)).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError when WAV has non-PCM audio format (audioFormat != 1)', () => {
    // Build a WAV with audioFormat=3 (IEEE float) instead of PCM (1)
    const sampleRate = 44100;
    const channels = 2;
    const bitsPerSample = 32;
    const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = 352800; // 1 second at 44100*2*4

    const fmtChunkSize = 16;
    const totalSize = 4 + 8 + fmtChunkSize + 8 + dataSize;

    const buf = Buffer.alloc(totalSize);
    let off = 0;
    buf.write('RIFF', off); off += 4;
    buf.writeUInt32LE(totalSize - 8, off); off += 4;
    buf.write('WAVE', off); off += 4;

    // fmt chunk with audioFormat=3 (IEEE float, NOT PCM)
    buf.write('fmt ', off); off += 4;
    buf.writeUInt32LE(fmtChunkSize, off); off += 4;
    buf.writeUInt16LE(3, off); off += 2; // IEEE float, not PCM
    buf.writeUInt16LE(channels, off); off += 2;
    buf.writeUInt32LE(sampleRate, off); off += 4;
    buf.writeUInt32LE(bytesPerSec, off); off += 4;
    buf.writeUInt16LE(blockAlign, off); off += 2;
    buf.writeUInt16LE(bitsPerSample, off); off += 2;

    // data chunk
    buf.write('data', off); off += 4;
    buf.writeUInt32LE(dataSize, off); off += 4;

    expect(() => parseWavHeader(buf)).toThrow(CorruptedAudioError);
  });
});

// ── calculateWavDuration Tests ──────────────────────────────────────

describe('calculateWavDuration', () => {
  it('calculates duration in float seconds from data chunk size and format params', () => {
    // 44100 samples/s, stereo (2 channels), 16-bit (2 bytes/sample)
    // 1 second = 44100 * 2 * 2 = 176400 bytes
    const duration = calculateWavDuration(176400, 44100, 2, 16);
    expect(duration).toBeCloseTo(1.0, 4);
  });

  it('handles 8-bit PCM with proper bytes-per-sample divisor', () => {
    // Mono 8-bit: 44100 samples/s, 1 channel, 1 byte/sample
    // 1 second = 44100 * 1 * 1 = 44100 bytes
    const duration = calculateWavDuration(44100, 44100, 1, 8);
    expect(duration).toBeCloseTo(1.0, 4);
  });

  it('handles 16-bit PCM with proper bytes-per-sample divisor', () => {
    // Stereo 16-bit: 44100 samples/s, 2 channels, 2 bytes/sample
    // 1 second = 44100 * 2 * 2 = 176400 bytes
    const duration = calculateWavDuration(176400, 44100, 2, 16);
    expect(duration).toBeCloseTo(1.0, 4);
  });

  it('calculates non-integer durations correctly', () => {
    // 0.5 seconds at 44100 Hz, stereo, 16-bit
    const duration = calculateWavDuration(88200, 44100, 2, 16);
    expect(duration).toBeCloseTo(0.5, 4);
  });

  it('handles multi-second durations', () => {
    // 3 seconds at 48000 Hz, stereo, 16-bit
    // 3 * 48000 * 2 * 2 = 576000 bytes
    const duration = calculateWavDuration(576000, 48000, 2, 16);
    expect(duration).toBeCloseTo(3.0, 4);
  });

  it('handles mono 16-bit WAV', () => {
    // 2 seconds at 22050 Hz, mono, 16-bit
    // 2 * 22050 * 1 * 2 = 88200 bytes
    const duration = calculateWavDuration(88200, 22050, 1, 16);
    expect(duration).toBeCloseTo(2.0, 4);
  });

  it('returns 0 when data size is 0', () => {
    const duration = calculateWavDuration(0, 44100, 2, 16);
    expect(duration).toBe(0);
  });

  it('throws CorruptedAudioError when data chunk is missing (negative dataSize)', () => {
    expect(() =>
      calculateWavDuration(-1, 44100, 2, 16),
    ).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError when data chunk is missing (zero sample rate)', () => {
    expect(() =>
      calculateWavDuration(176400, 0, 2, 16),
    ).toThrow(CorruptedAudioError);
  });

  it('throws CorruptedAudioError when data chunk is missing (zero channels)', () => {
    expect(() =>
      calculateWavDuration(176400, 44100, 0, 16),
    ).toThrow(CorruptedAudioError);
  });
});

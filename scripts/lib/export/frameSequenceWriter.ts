/**
 * Buffers JPEG screencast frames to disk at a fixed frame rate.
 *
 * CDP Page.startScreencast emits frames as base64 JPEGs at whatever
 * rate Chromium decides (typically 30 fps when motion is heavy,
 * dropping when the page is idle). For ffmpeg we need a regular
 * frame sequence — frame_NNNNNNNN.jpg where N is the playback time
 * divided by the frame interval.
 *
 * Approach: ingest frames keyed by their arrival timestamp (ms from
 * record start), then on finalize, replay the buffer to emit one
 * frame per fixed interval, repeating the most-recent frame when
 * Chromium dropped one. ffmpeg consumes the resulting sequence with
 * `-framerate <rate>` and the math just works.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface FrameSequenceWriterOptions {
  /** Absolute directory where frames are written. Must already exist. */
  frameDir: string;
  /** Target frame rate; the output sequence has one file per 1/N seconds. */
  frameRate: number;
}

interface BufferedFrame {
  data: Buffer;
  receivedMs: number;
}

export class FrameSequenceWriter {
  private readonly frameDir: string;
  private readonly frameRate: number;
  private readonly intervalMs: number;
  private startedAtMs = 0;
  private buffer: BufferedFrame[] = [];

  constructor(options: FrameSequenceWriterOptions) {
    this.frameDir = options.frameDir;
    this.frameRate = options.frameRate;
    this.intervalMs = 1000 / options.frameRate;
  }

  /** Begin accepting frames. receivedMs is measured from this point. */
  start(startedAtMs: number): void {
    this.startedAtMs = startedAtMs;
    this.buffer = [];
  }

  /**
   * Ingest a screencast frame. base64Data is the raw CDP payload;
   * receivedAtMs is Date.now() at receipt time.
   */
  ingest(base64Data: string, receivedAtMs: number): void {
    if (this.startedAtMs === 0) return;
    this.buffer.push({
      data: Buffer.from(base64Data, 'base64'),
      receivedMs: receivedAtMs - this.startedAtMs,
    });
  }

  /**
   * Stop accepting frames, emit the fixed-rate sequence to disk.
   * Returns the number of frames written.
   *
   * Emission rule: for each output slot at time T = i * intervalMs,
   * pick the most-recent buffered frame whose receivedMs <= T. When
   * Chromium dropped frames (T < first receivedMs), use the first
   * frame as a placeholder.
   */
  async finalize(captureDurationMs: number): Promise<number> {
    if (this.buffer.length === 0) {
      throw new Error('FrameSequenceWriter: no frames were ingested');
    }
    // Sort defensively — events should arrive in order, but a stray
    // race in CDP delivery isn't impossible.
    const sorted = [...this.buffer].sort((a, b) => a.receivedMs - b.receivedMs);

    const frameCount = Math.max(1, Math.round((captureDurationMs / 1000) * this.frameRate));

    // Batched writes. Promise.all over 8000+ files at once exhausts
    // the Windows file-descriptor limit (EMFILE). 128 in flight at
    // a time keeps disk throughput high without saturating the FD pool.
    const CONCURRENCY = 128;
    let cursor = 0; // index into `sorted` of the current "active" frame
    const writes: Promise<void>[] = [];
    const flushBatch = async (): Promise<void> => {
      if (writes.length === 0) return;
      await Promise.all(writes);
      writes.length = 0;
    };
    for (let i = 0; i < frameCount; i++) {
      const slotMs = i * this.intervalMs;
      // Advance the cursor to the latest frame whose timestamp <= slotMs.
      while (cursor + 1 < sorted.length && sorted[cursor + 1].receivedMs <= slotMs) {
        cursor++;
      }
      const frame = sorted[cursor];
      const file = path.join(this.frameDir, `frame_${String(i).padStart(8, '0')}.jpg`);
      writes.push(writeFile(file, frame.data));
      if (writes.length >= CONCURRENCY) await flushBatch();
    }
    await flushBatch();
    return frameCount;
  }
}

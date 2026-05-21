/**
 * Dead-air compression for MP4 exports.
 *
 * After the SPA capture finishes, the recorded narration has long
 * silent gaps where the commentator LLM was generating the NEXT
 * move's text and the TTS hadn't started yet. Those silences also
 * mean the video has multiple seconds per move of "dead air" —
 * board sits still, no narration, no useful content.
 *
 * Approach:
 *   1. Run ffmpeg with the `silencedetect` audio filter on the input
 *      MP4. Parse the stderr log for "silence_start" / "silence_end"
 *      timestamps.
 *   2. Convert those silence ranges to KEEP ranges (their complement),
 *      optionally preserving a small head/tail buffer (default 0.4s)
 *      so word boundaries don't get clipped.
 *   3. Run a second ffmpeg pass with a filter_complex that trims to
 *      each keep range and concatenates them. Audio + video stay
 *      perfectly synced because the same trim ranges drive both.
 *
 * Tunables (defaults are conservative for chess narration):
 *   - silenceThresholdDb: dBFS below which audio is considered silent (-30)
 *   - minSilenceDurationS: silences shorter than this are kept as-is (0.6)
 *   - keepHeadMs / keepTailMs: padding around each kept segment (400 ms)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { registerPid } from './processRegistry';

export interface CompressDeadAirOptions {
  /** Input MP4 (with audio) produced by the first compose pass. */
  inputPath: string;
  /** Output MP4 (compressed). Typically `<slug>_tight.mp4`. */
  outputPath: string;
  /** Absolute path to the ffmpeg binary. */
  ffmpegPath: string;
  /** dBFS threshold for silence detection. Default -30. */
  silenceThresholdDb?: number;
  /** Silences shorter than this stay as-is. Default 0.6s. */
  minSilenceDurationS?: number;
  /** Pad before/after each kept segment, ms. Default 400. */
  keepHeadMs?: number;
  keepTailMs?: number;
}

export interface CompressDeadAirResult {
  inputPath: string;
  outputPath: string;
  inputDurationS: number;
  outputDurationS: number;
  removedS: number;
  silenceRanges: Array<{ startS: number; endS: number }>;
}

interface SilenceRange {
  startS: number;
  endS: number;
}

/**
 * Run silencedetect to enumerate silent ranges. Returns a sorted,
 * merged list of {start, end} pairs in seconds.
 */
async function detectSilences(opts: CompressDeadAirOptions): Promise<SilenceRange[]> {
  const thresh = opts.silenceThresholdDb ?? -30;
  const minD = opts.minSilenceDurationS ?? 0.6;
  const args = [
    '-i',
    opts.inputPath,
    '-af',
    `silencedetect=noise=${thresh}dB:duration=${minD}`,
    '-f',
    'null',
    '-',
  ];
  const stderr = await captureStderr(opts.ffmpegPath, args);
  const ranges: SilenceRange[] = [];
  let pendingStart: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const m1 = line.match(/silence_start:\s*([0-9.]+)/);
    if (m1) {
      pendingStart = Number(m1[1]);
      continue;
    }
    const m2 = line.match(/silence_end:\s*([0-9.]+)/);
    if (m2 && pendingStart !== null) {
      ranges.push({ startS: pendingStart, endS: Number(m2[1]) });
      pendingStart = null;
    }
  }
  return ranges;
}

/**
 * Probe the duration of the input MP4. Used so the final silence
 * range (if the file ends in silence) can be closed at file end.
 */
async function probeDuration(ffmpegPath: string, inputPath: string): Promise<number> {
  const stderr = await captureStderr(ffmpegPath, ['-i', inputPath]);
  const m = stderr.match(/Duration:\s*(\d{2}):(\d{2}):([0-9.]+)/);
  if (!m) throw new Error(`Could not probe duration of ${inputPath}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Convert silence ranges to keep ranges. Keep ranges are the
 * complement of the silence ranges, padded by keepHeadMs / keepTailMs.
 * Overlapping keeps are merged.
 */
function buildKeepRanges(
  silences: SilenceRange[],
  durationS: number,
  keepHeadMs: number,
  keepTailMs: number,
): SilenceRange[] {
  if (silences.length === 0) {
    return [{ startS: 0, endS: durationS }];
  }
  const sorted = [...silences].sort((a, b) => a.startS - b.startS);
  const keeps: SilenceRange[] = [];
  let cursor = 0;
  for (const sil of sorted) {
    const keepEnd = sil.startS + keepTailMs / 1000;
    if (keepEnd > cursor) keeps.push({ startS: cursor, endS: keepEnd });
    cursor = Math.max(cursor, sil.endS - keepHeadMs / 1000);
  }
  if (cursor < durationS) keeps.push({ startS: cursor, endS: durationS });
  // Drop zero-or-negative-length keeps; merge any back-to-back keeps.
  const cleaned: SilenceRange[] = [];
  for (const k of keeps) {
    if (k.endS <= k.startS) continue;
    const last = cleaned[cleaned.length - 1];
    if (last && k.startS - last.endS < 0.05) {
      last.endS = Math.max(last.endS, k.endS);
    } else {
      cleaned.push({ ...k });
    }
  }
  return cleaned;
}

/**
 * Build the ffmpeg filter_complex string for a list of keep ranges.
 * Trim video + audio to each range, then concat them in order.
 */
function buildTrimConcatFilter(keeps: SilenceRange[]): string {
  const parts: string[] = [];
  for (let i = 0; i < keeps.length; i++) {
    const { startS, endS } = keeps[i];
    parts.push(`[0:v]trim=start=${startS}:end=${endS},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=start=${startS}:end=${endS},asetpts=PTS-STARTPTS[a${i}]`);
  }
  const labels = keeps.map((_, i) => `[v${i}][a${i}]`).join('');
  parts.push(`${labels}concat=n=${keeps.length}:v=1:a=1[outv][outa]`);
  return parts.join(';');
}

export async function compressDeadAir(opts: CompressDeadAirOptions): Promise<CompressDeadAirResult> {
  const inputExists = await stat(opts.inputPath).then(() => true).catch(() => false);
  if (!inputExists) throw new Error(`compressDeadAir: input not found: ${opts.inputPath}`);
  await mkdir(path.dirname(opts.outputPath), { recursive: true });

  const inputDurationS = await probeDuration(opts.ffmpegPath, opts.inputPath);
  const silences = await detectSilences(opts);
  console.log(
    `[dead-air] ${silences.length} silence range(s) detected (>${opts.minSilenceDurationS ?? 0.6}s @ ${opts.silenceThresholdDb ?? -30}dB)`,
  );

  if (silences.length === 0) {
    // Nothing to compress; copy through unchanged so callers can
    // always rely on outputPath existing.
    await runFfmpeg(opts.ffmpegPath, ['-y', '-i', opts.inputPath, '-c', 'copy', opts.outputPath]);
    return {
      inputPath: opts.inputPath,
      outputPath: opts.outputPath,
      inputDurationS,
      outputDurationS: inputDurationS,
      removedS: 0,
      silenceRanges: silences,
    };
  }

  const keeps = buildKeepRanges(silences, inputDurationS, opts.keepHeadMs ?? 400, opts.keepTailMs ?? 400);
  if (keeps.length === 0) {
    throw new Error('[dead-air] All audio detected as silence — refusing to produce an empty MP4.');
  }
  const filter = buildTrimConcatFilter(keeps);
  const args = [
    '-y',
    '-i',
    opts.inputPath,
    '-filter_complex',
    filter,
    '-map',
    '[outv]',
    '-map',
    '[outa]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    opts.outputPath,
  ];
  await runFfmpeg(opts.ffmpegPath, args);
  const outputDurationS = await probeDuration(opts.ffmpegPath, opts.outputPath);
  return {
    inputPath: opts.inputPath,
    outputPath: opts.outputPath,
    inputDurationS,
    outputDurationS,
    removedS: inputDurationS - outputDurationS,
    silenceRanges: silences,
  };
}

function captureStderr(ffmpegPath: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve) => {
    // ffmpeg writes its log to stderr; -f null - sends video to /dev/null
    const child: ChildProcess = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    if (child.pid !== undefined) {
      const unregister = registerPid(child.pid);
      child.once('exit', unregister);
    }
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    // silencedetect runs as a side-effect of decoding; exit code may
    // be non-zero when ffmpeg can't produce the null sink on some
    // versions, but the stderr log is what we need either way.
    child.once('exit', () => resolve(stderr));
  });
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (child.pid !== undefined) {
      const unregister = registerPid(child.pid);
      child.once('exit', unregister);
    }
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n--- stderr tail ---\n${stderr.slice(-2000)}`));
    });
  });
}

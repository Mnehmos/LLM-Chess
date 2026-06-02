/**
 * One-off retight for the London full mp4.
 *
 * Prior attempts using filter_complex with 188 trim+concat segments
 * OOM'd libavfilter (system has 119 GB free; it's the filter graph
 * itself accumulating per-segment state). This version splits the
 * problem: extract each keep range to a temp mp4 (independent encode,
 * tiny graph), then losslessly concat them with the concat demuxer.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const slug = argv[0] ?? 'london_system_lesson';
const inputPath = path.join(repoRoot, 'exports', slug, `${slug}.mp4`);
const outputPath = inputPath.replace(/\.mp4$/, '_tight.mp4');
const tempDir = path.join(os.tmpdir(), `retight-${slug}-${Date.now()}`);

const ffmpegPath = ffmpegStatic;
if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path');

const SILENCE_THRESHOLD_DB = -30;
const MIN_SILENCE_DURATION_S = 0.6;
const KEEP_HEAD_S = 0.4;
const KEEP_TAIL_S = 0.4;

function runFfmpeg(args: string[], captureStderr = false, label = ''): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(ffmpegPath!, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      const s = chunk.toString();
      if (captureStderr) stderr += s;
      else if (label) {
        // suppress per-segment chatter; only show the last-line "frame=" progress
      } else {
        process.stderr.write(s);
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ exitCode: code ?? -1, stderr });
    });
  });
}

async function probeDuration(filePath: string): Promise<number> {
  const { stderr } = await runFfmpeg(['-i', filePath], true);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`could not parse duration from ${filePath}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function detectSilences(filePath: string): Promise<Array<{ startS: number; endS: number }>> {
  const args = [
    '-hide_banner',
    '-nostats',
    '-i', filePath,
    '-af', `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=${MIN_SILENCE_DURATION_S}`,
    '-f', 'null', '-',
  ];
  const { stderr } = await runFfmpeg(args, true);
  const ranges: Array<{ startS: number; endS: number }> = [];
  const startRe = /silence_start:\s*(-?\d+(?:\.\d+)?)/g;
  const endRe = /silence_end:\s*(-?\d+(?:\.\d+)?)\s*\|\s*silence_duration/g;
  const starts: number[] = [];
  const ends: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(stderr)) !== null) starts.push(Math.max(0, Number(m[1])));
  while ((m = endRe.exec(stderr)) !== null) ends.push(Number(m[1]));
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    if (ends[i] > starts[i]) ranges.push({ startS: starts[i], endS: ends[i] });
  }
  return ranges;
}

function buildKeepRanges(
  silences: Array<{ startS: number; endS: number }>,
  durationS: number,
  headPad: number,
  tailPad: number,
): Array<{ startS: number; endS: number }> {
  const keeps: Array<{ startS: number; endS: number }> = [];
  let cursor = 0;
  for (const s of silences) {
    const keepEnd = Math.max(cursor, Math.min(s.startS + tailPad, durationS));
    if (keepEnd > cursor + 0.05) keeps.push({ startS: cursor, endS: keepEnd });
    cursor = Math.max(keepEnd, s.endS - headPad);
  }
  if (cursor < durationS - 0.05) keeps.push({ startS: cursor, endS: durationS });
  return keeps;
}

async function encodeSegment(
  input: string,
  startS: number,
  endS: number,
  outPath: string,
): Promise<void> {
  const args = [
    '-y',
    '-ss', String(startS),
    '-to', String(endS),
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-crf', '16',
    '-maxrate', '12M',
    '-bufsize', '24M',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-avoid_negative_ts', 'make_zero',
    outPath,
  ];
  const { exitCode, stderr } = await runFfmpeg(args, true);
  if (exitCode !== 0) {
    throw new Error(`segment encode failed for [${startS}..${endS}]:\n${stderr.slice(-1500)}`);
  }
}

async function concatLossless(segmentPaths: string[], outPath: string): Promise<void> {
  const listFile = path.join(tempDir, 'concat-list.txt');
  const listBody = segmentPaths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listFile, listBody, 'utf8');
  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c', 'copy',
    outPath,
  ];
  const { exitCode, stderr } = await runFfmpeg(args, true);
  if (exitCode !== 0) {
    throw new Error(`concat failed:\n${stderr.slice(-2000)}`);
  }
}

async function main() {
  console.log(`[retight] in:    ${inputPath}`);
  console.log(`[retight] out:   ${outputPath}`);
  console.log(`[retight] tmp:   ${tempDir}`);

  const inputExists = await stat(inputPath).then(() => true).catch(() => false);
  if (!inputExists) throw new Error(`input not found: ${inputPath}`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(tempDir, { recursive: true });

  const durationS = await probeDuration(inputPath);
  console.log(`[retight] input duration: ${durationS.toFixed(1)}s`);

  console.log(`[retight] detecting silences...`);
  const silences = await detectSilences(inputPath);
  console.log(`[retight] ${silences.length} silence range(s) detected`);

  const keeps = buildKeepRanges(silences, durationS, KEEP_HEAD_S, KEEP_TAIL_S);
  if (keeps.length === 0) throw new Error('all audio detected as silence');
  const keepDuration = keeps.reduce((sum, k) => sum + (k.endS - k.startS), 0);
  console.log(`[retight] keeping ${keeps.length} segments, total ${keepDuration.toFixed(1)}s (removing ${(durationS - keepDuration).toFixed(1)}s)`);

  const segmentPaths: string[] = [];
  const t0 = Date.now();
  for (let i = 0; i < keeps.length; i++) {
    const { startS, endS } = keeps[i];
    const segPath = path.join(tempDir, `seg-${String(i).padStart(4, '0')}.mp4`);
    await encodeSegment(inputPath, startS, endS, segPath);
    segmentPaths.push(segPath);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    if ((i + 1) % 10 === 0 || i === keeps.length - 1) {
      console.log(`[retight] encoded ${i + 1}/${keeps.length} segments (${elapsed}s elapsed)`);
    }
  }

  console.log(`[retight] concat-merging ${segmentPaths.length} segments...`);
  await concatLossless(segmentPaths, outputPath);

  const outDuration = await probeDuration(outputPath);
  console.log(`[retight] DONE — wrote ${outputPath}`);
  console.log(`[retight] ${durationS.toFixed(1)}s → ${outDuration.toFixed(1)}s (removed ${(durationS - outDuration).toFixed(1)}s)`);

  // best-effort cleanup
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error('[retight] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

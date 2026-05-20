/**
 * Compose a frame sequence + (optional) narration audio into an MP4
 * via ffmpeg-static. No audio mixing in Phase 3 — the SPA plays TTS
 * live during capture but the audio is NOT recorded by CDP screencast;
 * we emit a silent MP4 for now. A follow-up can add pre-rendered
 * TTS clips composed at segmentTimings offsets (Clio's pattern).
 *
 * Silent-MP4-first keeps Phase 3 reviewable. Audio mux lands as a
 * Phase 3.1 follow-up after Phase 3 merges.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { registerPid } from './processRegistry';

export interface ComposeOptions {
  /** Absolute path to a directory containing frame_00000000.jpg, frame_00000001.jpg, … */
  frameDir: string;
  /** Frame rate matching the writer's output (typically 30). */
  frameRate: number;
  /** Absolute output path for the .mp4 file. */
  outputPath: string;
  /** Absolute path to the ffmpeg binary. */
  ffmpegPath: string;
}

/**
 * Run ffmpeg to encode the frame sequence into a playable MP4.
 *
 * Args breakdown:
 *   -framerate <rate>         expected input frame rate
 *   -i frame_%08d.jpg         glob of JPEG inputs
 *   -c:v libx264              widely-supported H.264 encoder
 *   -pix_fmt yuv420p          required for QuickTime / browser playback
 *   -movflags +faststart      enables streaming (metadata at file head)
 *   -preset veryfast          balance speed vs. file size; iteration friendly
 *   -crf 20                   visually transparent quality (good for code text)
 *   -y                        overwrite output without prompting
 */
export async function composeMp4(options: ComposeOptions): Promise<void> {
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const args = [
    '-y',
    '-framerate',
    String(options.frameRate),
    '-i',
    path.join(options.frameDir, 'frame_%08d.jpg'),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    options.outputPath,
  ];
  console.log(`[ffmpeg] composing ${options.outputPath}`);
  await runFfmpeg(options.ffmpegPath, args);
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
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}\n--- stderr tail ---\n${stderr.slice(-2000)}`));
      }
    });
  });
}
